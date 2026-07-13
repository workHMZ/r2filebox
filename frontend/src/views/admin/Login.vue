<template>
  <main
    id="main-content"
    class="login-container"
    tabindex="-1"
    aria-labelledby="admin-login-title"
  >
    <div class="bg-decoration" aria-hidden="true"></div>

    <div class="login-toolbar">
      <LanguageSwitch inline />
    </div>

    <div class="login-card glass-card">
      <div class="login-header">
        <AppLogo size="large" />
        <h1 id="admin-login-title">R2FileBox</h1>
        <p>{{ t('admin.login.subtitle') }}</p>
      </div>

      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        :validate-on-rule-change="false"
        :aria-busy="loading"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item ref="usernameFormItemRef" prop="username" class="form-item-glass">
          <label class="sr-only" for="admin-login-username">{{ t('admin.login.username') }}</label>
          <el-input
            id="admin-login-username"
            ref="usernameInputRef"
            v-model="loginForm.username"
            name="username"
            :placeholder="t('admin.login.username')"
            size="large"
            autocomplete="username"
            :aria-invalid="usernameInvalid"
            :aria-describedby="usernameInvalid ? 'admin-login-username-error' : undefined"
            clearable
            @input="loginError = ''"
          >
            <template #prefix>
              <el-icon aria-hidden="true"><User /></el-icon>
            </template>
          </el-input>
          <template #error="{ error }">
            <div id="admin-login-username-error" class="el-form-item__error" role="alert">{{ error }}</div>
          </template>
        </el-form-item>

        <el-form-item ref="passwordFormItemRef" prop="password" class="form-item-glass">
          <label class="sr-only" for="admin-login-password">{{ t('admin.login.password') }}</label>
          <el-input
            id="admin-login-password"
            ref="passwordInputRef"
            v-model="loginForm.password"
            name="password"
            :type="passwordVisible ? 'text' : 'password'"
            :placeholder="t('admin.login.password')"
            size="large"
            autocomplete="current-password"
            :aria-invalid="passwordInvalid"
            :aria-describedby="passwordInvalid ? 'admin-login-password-error' : undefined"
            @input="loginError = ''"
          >
            <template #prefix>
              <el-icon aria-hidden="true"><Lock /></el-icon>
            </template>
            <template #suffix>
              <button
                type="button"
                class="password-toggle"
                :aria-label="passwordVisible ? t('a11y.hidePassword') : t('a11y.showPassword')"
                :aria-pressed="passwordVisible"
                :title="passwordVisible ? t('a11y.hidePassword') : t('a11y.showPassword')"
                @click="passwordVisible = !passwordVisible"
              >
                <el-icon aria-hidden="true">
                  <View v-if="passwordVisible" />
                  <Hide v-else />
                </el-icon>
              </button>
            </template>
          </el-input>
          <template #error="{ error }">
            <div id="admin-login-password-error" class="el-form-item__error" role="alert">{{ error }}</div>
          </template>
        </el-form-item>

        <el-form-item class="actions-row">
          <el-button
            type="primary"
            size="large"
            native-type="submit"
            class="login-button"
            :loading="loading"
            :aria-busy="loading"
          >
            <el-icon v-if="!loading" style="margin-right: 4px;" aria-hidden="true"><Promotion /></el-icon>
            {{ loading ? t('admin.login.loading') : t('admin.login.button') }}
          </el-button>
        </el-form-item>
        <p v-if="loginError" class="sr-only">{{ loginError }}</p>
      </el-form>

      <div class="login-footer">
        <el-button link class="back-home-btn" @click="$router.push('/')">
          <el-icon aria-hidden="true"><Back /></el-icon>
          {{ t('common.home') }}
        </el-button>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormItemInstance, InputInstance } from 'element-plus'
import { User, Lock, Promotion, Back, View, Hide } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useI18n } from '@/i18n'
import AppLogo from '@/components/AppLogo.vue'
import LanguageSwitch from '@/components/LanguageSwitch.vue'

const router = useRouter()
const userStore = useUserStore()
const { locale, t } = useI18n()
const loginFormRef = ref<FormInstance>()
const usernameFormItemRef = ref<FormItemInstance>()
const passwordFormItemRef = ref<FormItemInstance>()
const usernameInputRef = ref<InputInstance>()
const passwordInputRef = ref<InputInstance>()
const loading = ref(false)
const passwordVisible = ref(false)
const loginError = ref('')

watch(locale, () => {
  loginFormRef.value?.clearValidate()
  loginError.value = ''
})

const loginForm = reactive({
  username: '',
  password: ''
})

const loginRules = computed(() => ({
  username: [
    { required: true, message: t('admin.login.requiredUser'), trigger: 'blur' }
  ],
  password: [
    { required: true, message: t('admin.login.requiredPassword'), trigger: 'blur' },
    { min: 6, message: t('admin.login.passwordLength'), trigger: 'blur' }
  ]
}))

const usernameInvalid = computed(() => usernameFormItemRef.value?.validateState === 'error')
const passwordInvalid = computed(() => passwordFormItemRef.value?.validateState === 'error')

const handleLogin = async () => {
  if (!loginFormRef.value) return

  loginError.value = ''
  const valid = await loginFormRef.value.validate().catch(() => false)
  if (!valid) {
    await nextTick()
    if (usernameInvalid.value) {
      usernameInputRef.value?.focus()
    } else if (passwordInvalid.value) {
      passwordInputRef.value?.focus()
    }
    return
  }

  loading.value = true
  try {
    await userStore.login(loginForm.username, loginForm.password)
    ElMessage.success(t('admin.login.done'))
    router.push('/admin')
  } catch (error: unknown) {
    loginError.value = error instanceof Error ? error.message : t('admin.login.failed')
    ElMessage.error(loginError.value)
  } finally {
    loading.value = false
  }
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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

.password-toggle {
  display: inline-flex;
  width: 24px;
  height: 24px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--glass-text-secondary);
  cursor: pointer;
}

.password-toggle:hover {
  color: var(--text-primary);
}

.password-toggle:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
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
