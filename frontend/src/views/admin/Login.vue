<template>
  <main
    id="main-content"
    class="login-container"
    tabindex="-1"
    aria-labelledby="admin-login-title"
  >
    <div class="login-toolbar">
      <InterfaceControls />
    </div>

    <div class="login-card">
      <div class="login-header">
        <AppLogo size="large" />
        <h1 id="admin-login-title">{{ configStore.siteName }}</h1>
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
            <el-icon v-if="!loading" aria-hidden="true"><Promotion /></el-icon>
            {{ loading ? t('admin.login.loading') : t('admin.login.button') }}
          </el-button>
        </el-form-item>
        <p v-if="loginError" class="sr-only" role="alert">{{ loginError }}</p>
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
import { useConfigStore } from '@/stores/config'
import { useI18n } from '@/i18n'
import AppLogo from '@/components/AppLogo.vue'
import InterfaceControls from '@/components/InterfaceControls.vue'
import { safeAdminRedirect } from '@/utils/admin-redirect'

const router = useRouter()
const userStore = useUserStore()
const configStore = useConfigStore()
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
    await router.replace(safeAdminRedirect(router.currentRoute.value.query.redirect))
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
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;
  padding: max(var(--space-2xl), env(safe-area-inset-top, 0px)) var(--space-sm)
    max(var(--space-lg), env(safe-area-inset-bottom, 0px));
  overflow-x: hidden;
}

.login-toolbar {
  position: absolute;
  top: var(--space-md);
  right: var(--space-md);
  z-index: 2;
}

/* A single card on paper: the coral head rule is the binding edge the rest of
   the app carries down its left side. */
.login-card {
  width: 100%;
  max-width: 400px;
  padding: var(--space-lg) var(--space-md) var(--space-md);
  border: 1px solid var(--border-subtle);
  border-top: 2px solid var(--primary-color);
  border-radius: var(--radius-lg);
  background: var(--surface-page);
}

.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2xs);
  margin-bottom: var(--space-lg);
  text-align: center;
}

.login-header h1 {
  max-width: 100%;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: var(--fs-display-sm);
  font-weight: 500;
  letter-spacing: var(--tracking-display);
  line-height: var(--leading-display);
  overflow-wrap: anywhere;
}

.login-header p {
  color: var(--text-secondary);
  font-size: var(--fs-body-sm);
}

.password-toggle {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.password-toggle:hover {
  color: var(--text-primary);
}

.password-toggle:focus-visible {
  outline: 2px solid var(--primary-strong);
  outline-offset: 2px;
}

.form-item-glass {
  margin-bottom: var(--space-md);
}

.actions-row {
  margin: var(--space-md) 0 var(--space-2xs);
}

.login-button {
  width: 100%;
  min-height: 48px;
  font-size: var(--fs-title-sm);
}

.login-footer {
  margin-top: var(--space-xs);
  text-align: center;
}

.back-home-btn {
  color: var(--text-secondary) !important;
  font-size: var(--fs-body-sm);
  font-weight: 500;
}

.back-home-btn:hover {
  color: var(--primary-ink) !important;
}

@media (max-width: 767px) {
  .login-container {
    align-items: flex-start;
  }

  .login-toolbar {
    top: var(--space-xs);
    right: var(--space-xs);
  }

  .login-card {
    padding: var(--space-md) var(--space-sm);
  }
}
</style>
