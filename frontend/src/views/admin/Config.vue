<template>
  <div class="system-config">
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="card-header">
          <h3>{{ t('config.title') }}</h3>
          <el-button type="primary" @click="saveConfig" :loading="saving">
            {{ t('config.save') }}
          </el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <!-- 基础配置 -->
        <el-tab-pane :label="t('config.basic')" name="basic">
          <el-form :model="configForm.base" label-width="140px" class="config-form">
            <el-form-item :label="t('config.siteName')">
              <el-input v-model="configForm.base.name" />
            </el-form-item>

            <el-form-item :label="t('config.siteDescription')">
              <el-input v-model="configForm.base.description" type="textarea" :rows="3" />
            </el-form-item>

            <el-form-item :label="t('config.port')">
              <el-input-number v-model="configForm.base.port" :min="1" :max="65535" />
            </el-form-item>

            <el-form-item :label="t('config.production')">
              <el-switch v-model="configForm.base.production" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 上传配置 -->
        <el-tab-pane :label="t('config.upload')" name="upload">
          <el-form :model="configForm.transfer.upload" label-width="140px" class="config-form">
            <el-form-item :label="t('config.openUpload')">
              <el-switch v-model="configForm.transfer.upload.openupload" :active-value="1" :inactive-value="0" />
            </el-form-item>

            <el-form-item :label="t('config.uploadSize')">
              <el-input-number
                v-model="configForm.transfer.upload.uploadsize"
                :min="1048576"
                :step="1048576"
                controls-position="right"
              />
              <span class="field-hint">{{ t('config.uploadSizeHint') }}</span>
            </el-form-item>

            <el-form-item :label="t('config.chunkUpload')">
              <el-switch v-model="configForm.transfer.upload.enablechunk" :active-value="1" :inactive-value="0" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane :label="t('config.security')" name="security">
          <el-form :model="configForm.security" label-width="160px" class="config-form config-form--wide">
            <el-form-item :label="t('config.auditLog')">
              <el-switch v-model="configForm.security.enable_audit_log" :active-value="1" :inactive-value="0" />
            </el-form-item>

            <el-form-item :label="t('config.accessLog')">
              <el-switch v-model="configForm.security.enable_access_log" :active-value="1" :inactive-value="0" />
              <span class="field-hint">{{ t('config.accessLogHint') }}</span>
            </el-form-item>

            <el-form-item :label="t('config.kvRateLimit')">
              <el-switch v-model="configForm.transfer.rate_limit.enable_kv" :active-value="1" :inactive-value="0" />
            </el-form-item>

            <el-form-item :label="t('config.uploadInitRate')">
              <el-input-number v-model="configForm.transfer.rate_limit.upload_per_minute" :min="1" :max="600" />
            </el-form-item>

            <el-form-item :label="t('config.uploadPartRate')">
              <el-input-number v-model="configForm.transfer.rate_limit.upload_part_per_minute" :min="1" :max="2000" />
            </el-form-item>

            <el-form-item :label="t('config.resolveRate')">
              <el-input-number v-model="configForm.transfer.rate_limit.resolve_per_minute" :min="1" :max="2000" />
            </el-form-item>

            <el-form-item :label="t('config.downloadRate')">
              <el-input-number v-model="configForm.transfer.rate_limit.download_per_minute" :min="1" :max="2000" />
            </el-form-item>

            <el-form-item :label="t('config.authRate')">
              <el-input-number v-model="configForm.transfer.rate_limit.auth_per_15_min" :min="1" :max="300" />
            </el-form-item>

            <el-form-item :label="t('config.turnstile')">
              <el-switch v-model="configForm.security.require_turnstile" :active-value="1" :inactive-value="0" />
            </el-form-item>

            <el-form-item :label="t('config.turnstileSiteKey')">
              <el-input v-model="configForm.security.turnstile_site_key" />
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api/admin'
import { useConfigStore } from '@/stores/config'
import { useI18n } from '@/i18n'

const loading = ref(false)
const saving = ref(false)
const activeTab = ref('basic')
const configStore = useConfigStore()
const { t } = useI18n()

const configForm = reactive({
  base: {
    name: '',
    description: '',
    port: 12346,
    host: '0.0.0.0',
    production: false
  },
  transfer: {
    upload: {
      openupload: 1,
      uploadsize: 10485760,
      enablechunk: 1,
      chunksize: 2097152
    },
    rate_limit: {
      enable_kv: 1,
      upload_per_minute: 10,
      upload_part_per_minute: 80,
      resolve_per_minute: 120,
      download_per_minute: 120,
      auth_per_15_min: 20
    }
  },
  security: {
    enable_audit_log: 1,
    enable_access_log: 0,
    require_turnstile: 0,
    turnstile_site_key: ''
  }
})

const fetchConfig = async () => {
  loading.value = true
  try {
    const res = await adminApi.getConfig()
    if (res.code === 200 && res.data) {
      // 映射配置数据
      if (res.data.base) {
        Object.assign(configForm.base, res.data.base)
      }
      if (res.data.transfer) {
        Object.assign(configForm.transfer, res.data.transfer)
      }
      if (res.data.security) {
        Object.assign(configForm.security, res.data.security)
      }
    }
  } catch (error) {
    console.error('Failed to load config:', error)
    ElMessage.error(t('config.fetchFailed'))
  } finally {
    loading.value = false
  }
}

const saveConfig = async () => {
  saving.value = true
  try {
    const res = await adminApi.updateConfig(configForm)
    if (res.code === 200) {
      ElMessage.success(t('config.saveDone'))
      // 刷新全局配置
      await configStore.refreshConfig()
      await fetchConfig()
    } else {
      ElMessage.error(res.message || t('config.saveFailed'))
    }
  } catch (error) {
    console.error('Failed to save config:', error)
    ElMessage.error(t('config.saveFailed'))
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchConfig()
})
</script>

<style scoped>
.system-config {
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.config-form {
  max-width: 620px;
  padding-top: 12px;
}

.config-form--wide {
  max-width: 740px;
}

.field-hint {
  margin-left: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}

@media (max-width: 640px) {
  .card-header {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }

  .config-form :deep(.el-form-item) {
    display: block;
  }

  .config-form :deep(.el-form-item__label) {
    width: auto !important;
    height: auto;
    margin-bottom: 7px;
    line-height: 1.4;
  }

  .config-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }

  .field-hint {
    display: block;
    width: 100%;
    margin: 7px 0 0;
  }
}
</style>
