<template>
  <div class="login-container">
    <div class="bg-decoration"></div>

    <div class="login-toolbar">
      <LanguageSwitch inline />
    </div>

    <div class="login-card glass-card">
      <div class="login-header">
        <AppLogo size="large" />
        <h1>R2FileBox</h1>
        <p>{{ t('admin.login.subtitle') }}</p>
      </div>

      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        class="login-form"
      >
        <el-form-item prop="username" class="form-item-glass">
          <el-input
            v-model="loginForm.username"
            :placeholder="t('admin.login.username')"
            size="large"
            :prefix-icon="User"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password" class="form-item-glass">
          <el-input
            v-model="loginForm.password"
            type="password"
            :placeholder="t('admin.login.password')"
            size="large"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item class="actions-row">
          <el-button
            type="primary"
            size="large"
            class="login-button"
            :loading="loading"
            @click="handleLogin"
          >
            <el-icon v-if="!loading" style="margin-right: 4px;"><Promotion /></el-icon>
            {{ loading ? t('admin.login.loading') : t('admin.login.button') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        <el-button link class="back-home-btn" @click="$router.push('/')">
          <el-icon><Back /></el-icon>
          {{ t('common.home') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, Promotion, Back } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useI18n } from '@/i18n'
import AppLogo from '@/components/AppLogo.vue'
import LanguageSwitch from '@/components/LanguageSwitch.vue'

const router = useRouter()
const userStore = useUserStore()
const { t } = useI18n()
const loginFormRef = ref()
const loading = ref(false)

const loginForm = reactive({
  username: '',
  password: ''
})

const loginRules = {
  username: [
    { required: true, message: t('admin.login.requiredUser'), trigger: 'blur' }
  ],
  password: [
    { required: true, message: t('admin.login.requiredPassword'), trigger: 'blur' },
    { min: 6, message: t('admin.login.passwordLength'), trigger: 'blur' }
  ]
}

const handleLogin = async () => {
  if (!loginFormRef.value) return
  
  await loginFormRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    loading.value = true
    try {
      await userStore.login(loginForm.username, loginForm.password)
      ElMessage.success(t('admin.login.done'))
      router.push('/admin')
    } catch (error: unknown) {
      ElMessage.error(error instanceof Error ? error.message : t('admin.login.failed'))
    } finally {
      loading.value = false
    }
  })
}
</script>

<style scoped>
.login-container {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.login-toolbar {
  position: absolute;
  top: 22px;
  right: 24px;
  z-index: 2;
}

.login-card {
  width: 100%;
  max-width: 420px;
  margin: 20px;
  padding: 42px 34px 30px;
  border-top: 3px solid var(--primary-color);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.login-header h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 760;
  color: var(--text-primary);
  letter-spacing: 0;
}

.login-header p {
  margin: 0;
  font-size: 13px;
  color: var(--glass-text-secondary);
}

.login-form {
  margin-top: 10px;
}

.form-item-glass {
  margin-bottom: 22px;
}

.actions-row {
  margin-top: 28px;
  margin-bottom: 16px;
}

.login-button {
  width: 100%;
  height: 48px;
  font-weight: 700;
}

.login-footer {
  text-align: center;
  margin-top: 16px;
}

.back-home-btn {
  color: var(--glass-text-secondary) !important;
  font-weight: 500;
  font-size: 13px;
  
  &:hover {
    color: var(--primary-color) !important;
  }
}

@media (max-width: 480px) {
  .login-toolbar {
    top: 12px;
    right: 12px;
  }

  .login-card {
    margin: 74px 12px 20px;
    padding: 34px 20px 24px;
  }
}
</style>
