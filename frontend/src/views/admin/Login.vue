<template>
  <div class="login-container">
    <!-- 动态背景 -->
    <div class="bg-decoration">
      <div class="circle circle1"></div>
      <div class="circle circle2"></div>
      <div class="circle circle3"></div>
    </div>

    <div class="login-card glass-card">
      <div class="login-header">
        <div class="logo-wrapper">
          <div class="logo-icon">
            <el-icon size="36"><Box /></el-icon>
          </div>
        </div>
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
import { User, Lock, Box, Promotion, Back } from '@element-plus/icons-vue'
import { adminApi } from '@/api/admin'
import { useUserStore } from '@/stores/user'
import { useI18n } from '@/i18n'

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
      const res = await adminApi.login(loginForm)
      if (res.code === 200) {
        localStorage.setItem('token', res.data.token)
        localStorage.setItem('userRole', res.data.user.role || 'admin')
        userStore.token = res.data.token
        userStore.userInfo = res.data.user
        
        ElMessage.success(t('admin.login.done'))
        router.push('/admin')
      } else {
        ElMessage.error(res.message || t('admin.login.failed'))
      }
    } catch (error: any) {
      ElMessage.error(error.message || t('admin.login.failed'))
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

.login-card {
  width: 100%;
  max-width: 440px;
  margin: 20px;
  padding: 48px 36px 36px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.logo-wrapper {
  margin-bottom: 4px;
}

.logo-icon {
  width: 64px;
  height: 64px;
  background: var(--primary-gradient);
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 10px 24px rgba(15, 118, 110, 0.18);
}

.login-header h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
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
  .login-card {
    padding: 36px 20px 24px;
  }
}
</style>
