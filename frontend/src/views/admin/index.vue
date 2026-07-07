<template>
  <div class="admin-layout">
    <!-- 动态流动背景 (应用到整个管理后台视图中) -->
    <div class="bg-decoration">
      <div class="circle circle1"></div>
      <div class="circle circle2"></div>
      <div class="circle circle3"></div>
    </div>

    <el-container class="admin-container">
      <!-- 侧边栏 -->
      <el-aside width="240px" class="admin-aside">
        <div class="admin-logo">
          <div class="logo-icon">
            <el-icon size="24"><Box /></el-icon>
          </div>
          <div class="logo-text">
            <h2>R2FileBox</h2>
            <p>{{ t('admin.subtitle') }}</p>
          </div>
        </div>
        
        <el-menu
          :default-active="$route.path"
          class="admin-menu"
          router
        >
          <el-menu-item index="/admin/dashboard">
            <el-icon><Monitor /></el-icon>
            <span>{{ t('admin.dashboard') }}</span>
          </el-menu-item>
          
          <el-menu-item index="/admin/files">
            <el-icon><Folder /></el-icon>
            <span>{{ t('admin.files') }}</span>
          </el-menu-item>
          
          <el-menu-item index="/admin/storage">
            <el-icon><Box /></el-icon>
            <span>{{ t('admin.storage') }}</span>
          </el-menu-item>

          <el-menu-item index="/admin/logs">
            <el-icon><Document /></el-icon>
            <span>{{ t('admin.logs') }}</span>
          </el-menu-item>

          <el-menu-item index="/admin/config">
            <el-icon><Setting /></el-icon>
            <span>{{ t('admin.config') }}</span>
          </el-menu-item>

          <el-menu-item index="/admin/maintenance">
            <el-icon><Tools /></el-icon>
            <span>{{ t('admin.maintenance') }}</span>
          </el-menu-item>
        </el-menu>

        <div class="sidebar-footer">
          <el-button @click="goToUser" class="user-page-btn">
            <el-icon><Promotion /></el-icon>
            {{ t('admin.frontend') }}
          </el-button>
        </div>
      </el-aside>
      
      <!-- 右侧容器 -->
      <el-container class="main-container">
        <!-- 顶部导航 -->
        <el-header class="admin-header">
          <div class="header-left">
            <h3>{{ pageTitle }}</h3>
          </div>
          
          <div class="header-right">
            <LanguageSwitch inline />
            <el-dropdown @command="handleCommand" trigger="click">
              <div class="user-info">
                <el-avatar :size="32" class="user-avatar">
                  {{ t('common.admin').slice(0, 1) }}
                </el-avatar>
                <div class="user-details">
                  <span class="user-name">{{ t('common.admin') }}</span>
                  <span class="user-role">{{ t('admin.role') }}</span>
                </div>
                <el-icon class="arrow-icon"><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu class="admin-dropdown-menu">
                  <el-dropdown-item command="logout" divided>
                    <el-icon><SwitchButton /></el-icon>
                    {{ t('admin.logout') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>
        
        <!-- 内容区 -->
        <el-main class="admin-main">
          <!-- 内嵌视图，利用局部玻璃层浮动在主背景上 -->
          <div class="admin-content-card glass-card">
            <router-view />
          </div>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Monitor, Folder, Setting, ArrowDown, 
  Box, Document, Tools, Promotion, SwitchButton 
} from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useI18n } from '@/i18n'
import LanguageSwitch from '@/components/LanguageSwitch.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const { t } = useI18n()

const pageTitle = computed(() => {
  const titles: Record<string, string> = {
    '/admin/dashboard': t('admin.dashboard'),
    '/admin': t('admin.dashboard'),
    '/admin/files': t('admin.files'),
    '/admin/config': t('admin.config'),
    '/admin/storage': t('admin.storage'),
    '/admin/logs': t('admin.logs'),
    '/admin/maintenance': t('admin.maintenance')
  }
  return titles[route.path] || t('admin.title')
})

const goToUser = () => {
  window.open('/', '_blank')
}

const handleCommand = async (command: string) => {
  switch (command) {
    case 'logout':
      try {
        await ElMessageBox.confirm(t('admin.logoutConfirm'), t('admin.logoutTitle'), {
          type: 'warning',
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel')
        })
        userStore.logout()
        ElMessage.success(t('admin.logoutDone'))
        router.push('/admin/login')
      } catch (error: any) {
        if (error !== 'cancel') {
          console.error('登出故障:', error)
        }
      }
      break
  }
}
</script>

<style scoped>
.admin-layout {
  height: 100vh;
  position: relative;
  overflow: hidden;
}

.admin-container {
  height: 100%;
  position: relative;
  z-index: 1;
}

.main-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 侧边栏 */
.admin-aside {
  background: #ffffff !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  box-shadow: 10px 0 30px rgba(15, 23, 42, 0.04);
}

.admin-logo {
  height: 72px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  gap: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.logo-icon {
  width: 38px;
  height: 38px;
  background: var(--primary-gradient);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.18);
}

.logo-text h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0;
  text-align: left;
}

.logo-text p {
  margin: 1px 0 0;
  font-size: 10px;
  color: var(--glass-text-secondary);
  text-align: left;
}

.admin-menu {
  border: none;
  background: transparent;
  flex: 1;
  padding: 16px 0;
}

.admin-menu :deep(.el-menu-item) {
  color: var(--text-secondary);
  height: 46px;
  line-height: 46px;
  margin: 4px 12px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 13px;
  transition: all 0.3s;
}

.admin-menu :deep(.el-menu-item:hover) {
  background: #f8fafc !important;
  color: var(--text-primary);
}

.admin-menu :deep(.el-menu-item.is-active) {
  background: #f0fdfa !important;
  color: var(--primary-color) !important;
  box-shadow: none;
}

.admin-menu :deep(.el-icon) {
  font-size: 16px;
  margin-right: 10px;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--border-subtle);
}

.user-page-btn {
  width: 100%;
  background: #ffffff !important;
  border: 1px solid var(--border-subtle) !important;
  color: var(--text-primary) !important;
  border-radius: 10px;
  transition: all 0.3s;
  font-weight: 600;
  font-size: 12px;
  height: 38px;
}

.user-page-btn:hover {
  background: #f8fafc !important;
  border-color: var(--border-strong) !important;
  transform: translateY(-2px);
}

/* 顶部导航 */
.admin-header {
  background: rgba(255, 255, 255, 0.9) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  height: 72px;
}

.header-left h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: all 0.3s ease;
}

.user-info:hover {
  background: #ffffff;
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.user-avatar {
  background: #fef3c7;
  color: #92400e;
  font-weight: 800;
}

.user-details {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.user-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.user-role {
  font-size: 10px;
  color: var(--glass-text-secondary);
}

.arrow-icon {
  color: var(--glass-text-secondary);
  font-size: 12px;
}

/* 内容区 */
.admin-main {
  padding: 24px;
  height: calc(100vh - 72px);
  overflow-y: auto;
}

/* 后台子页玻璃态包装器 */
.admin-content-card {
  min-height: 100%;
}
</style>
