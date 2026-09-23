<template>
  <form class="get-share-container" @submit.prevent="handleGetShare">
    <div>
      <div class="lookup-row">
        <label class="sr-only" for="share-code-input">{{ t('a11y.shareCode') }}</label>
        <el-input
          id="share-code-input"
          v-model="shareCode"
          name="share-code"
          size="large"
          :placeholder="t('get.placeholder')"
          :aria-invalid="lookupError"
          :aria-describedby="lookupError ? 'code-lookup-error' : undefined"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          class="code-input"
          clearable
          @input="lookupError = false"
        >
          <template #prefix>
            <el-icon class="input-key-icon" aria-hidden="true"><Key /></el-icon>
          </template>
        </el-input>
        <el-button
          type="primary"
          size="large"
          native-type="submit"
          class="get-btn"
        >
          <template #icon>
            <el-icon aria-hidden="true"><Download /></el-icon>
          </template>
          {{ t('get.button') }}
        </el-button>
      </div>
      <p v-if="lookupError" id="code-lookup-error" class="sr-only">{{ t('get.empty') }}</p>
    </div>

    <div class="tips-card">
      <p class="tips-title">
        <el-icon class="tip-spark" aria-hidden="true"><HelpFilled /></el-icon>
        {{ t('get.tips.title') }}
      </p>
      <ul class="tips-list">
        <li>{{ t('get.tips.one') }}</li>
        <li>{{ t('get.tips.two') }}</li>
        <li>{{ t('get.tips.three') }}</li>
        <li>{{ t('get.tips.four') }}</li>
      </ul>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Key, Download, HelpFilled } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'
import { parseShareCode } from '@/utils/share-code'

const router = useRouter()
const { t } = useI18n()

const shareCode = ref('')
const lookupError = ref(false)

const handleGetShare = () => {
  const input = shareCode.value.trim()
  if (!input) {
    lookupError.value = true
    ElMessage.warning(t('get.empty'))
    return
  }

  const code = parseShareCode(input)
  if (!code) {
    lookupError.value = true
    ElMessage.warning(t('get.invalid'))
    return
  }

  router.push({ name: 'ShareView', params: { code } })
}
</script>

<style scoped>
.get-share-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.lookup-row {
  display: flex;
  align-items: stretch;
  gap: var(--space-xs);
}

.code-input {
  flex: 1;
  min-width: 0;
}

.code-input :deep(.el-input__wrapper) {
  height: 52px !important;
  min-height: 52px !important;
  padding: 0 var(--space-sm) !important;
}

.code-input :deep(.el-input__inner) {
  font-family: var(--font-code) !important;
  font-size: var(--fs-title-md) !important;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

/* The wide tracking is for the code itself; the placeholder is a sentence and
   has to stay readable. */
.code-input :deep(.el-input__inner)::placeholder {
  font-family: var(--font-primary);
  font-size: var(--fs-body-md);
  letter-spacing: normal;
  text-transform: none;
}

.input-key-icon {
  color: var(--text-secondary);
  font-size: var(--fs-title-md);
}

.get-btn {
  width: 148px;
  min-height: 52px;
  flex: 0 0 148px;
  font-size: var(--fs-title-sm);
}

/* The tips read as a ruled footnote on the sheet, not a second card. */
.tips-card {
  padding-top: var(--space-md);
  border-top: 1px solid var(--border-subtle);
}

.tips-title {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  margin-bottom: var(--space-xs);
  color: var(--text-primary);
  font-size: var(--fs-body-sm);
  font-weight: 600;
}

.tip-spark {
  color: var(--primary-ink);
}

.tips-list {
  display: grid;
  gap: var(--space-2xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tips-list li {
  position: relative;
  padding-left: var(--space-sm);
  color: var(--text-secondary);
  font-size: var(--fs-body-sm);
  line-height: var(--leading-body);
}

.tips-list li::before {
  content: '';
  position: absolute;
  top: 0.65em;
  left: 0;
  width: var(--space-2xs);
  height: 1px;
  background: var(--primary-color);
}

@media (max-width: 767px) {
  .lookup-row {
    flex-direction: column;
  }

  .get-btn {
    width: 100%;
    flex-basis: 52px;
  }
}
</style>
