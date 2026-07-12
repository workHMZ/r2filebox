<template>
  <div class="admin-layout">
    <div class="bg-decoration"></div>

    <el-container class="admin-container">
      <el-aside width="224px" :class="['admin-aside', { 'is-open': sidebarOpen }]">
        <div class="admin-logo">
          <AppLogo size="small" />
          <div class="logo-text">
            <h2>R2FileBox</h2>
            <p>{{ t('admin.subtitle') }}</p>
          </div>
        </div>
        
        <el-menu
          :default-active="$route.path"
          class="admin-menu"
          router
          @select="closeSidebar"
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
      <button
        v-if="sidebarOpen"
        class="aside-overlay"
        type="button"
        :aria-label="t('common.close')"
        @click="closeSidebar"
      ></button>
      
      <el-container class="main-container">
        <el-header class="admin-header">
          <div class="header-left">
            <el-button
              class="menu-toggle"
              text
              :aria-label="t('admin.title')"
              :title="t('admin.title')"
              @click="sidebarOpen = true"
            >
              <el-icon><Expand /></el-icon>
            </el-button>
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
        
        <el-main class="admin-main">
          <div class="admin-content">
            <router-view />
          </div>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Monitor, Folder, Setting, ArrowDown, 
  Box, Document, Tools, Promotion, SwitchButton, Expand
} from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useI18n } from '@/i18n'
import LanguageSwitch from '@/components/LanguageSwitch.vue'
import AppLogo from '@/components/AppLogo.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const { t } = useI18n()
const sidebarOpen = ref(false)

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
  window.open('/', '_blank', 'noopener,noreferrer')
}

const closeSidebar = () => {
  sidebarOpen.value = false
}

watch(() => route.path, closeSidebar)

const handleCommand = async (command: string) => {
  switch (command) {
    case 'logout':
      try {
        await ElMessageBox.confirm(t('admin.logoutConfirm'), t('admin.logoutTitle'), {
          type: 'warning',
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel')
        })
        const serverLoggedOut = await userStore.logout()
        if (serverLoggedOut) {
          ElMessage.success(t('admin.logoutDone'))
        } else {
          ElMessage.warning(t('request.network'))
        }
        router.push('/admin/login')
      } catch (error: unknown) {
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
  background: var(--surface-canvas);
}

.admin-container {
  height: 100%;
  position: relative;
  z-index: 1;
}

.main-container {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.admin-aside {
  background: #ffffff !important;
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  box-shadow: 6px 0 20px rgba(17, 31, 38, 0.025);
  z-index: 20;
}

.admin-logo {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 18px;
  gap: 11px;
  border-bottom: 1px solid var(--border-subtle);
}

.logo-text h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 760;
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
  padding: 14px 0;
}

.admin-menu :deep(.el-menu-item) {
  color: var(--text-secondary);
  height: 42px;
  line-height: 42px;
  margin: 3px 10px;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 13px;
  transition: color 0.18s ease, background 0.18s ease;
}

.admin-menu :deep(.el-menu-item:hover) {
  background: var(--surface-page) !important;
  color: var(--text-primary);
}

.admin-menu :deep(.el-menu-item.is-active) {
  background: var(--primary-soft) !important;
  color: var(--primary-color) !important;
  box-shadow: none;
}

.admin-menu :deep(.el-icon) {
  font-size: 16px;
  margin-right: 10px;
}

.sidebar-footer {
  padding: 14px;
  border-top: 1px solid var(--border-subtle);
}

.user-page-btn {
  width: 100%;
  background: #ffffff !important;
  border: 1px solid var(--border-subtle) !important;
  color: var(--text-primary) !important;
  border-radius: var(--radius-md);
  transition: border-color 0.18s ease, color 0.18s ease;
  font-weight: 600;
  font-size: 12px;
  height: 38px;
}

.user-page-btn:hover {
  background: var(--surface-page) !important;
  border-color: var(--primary-color) !important;
  color: var(--primary-color) !important;
}

.admin-header {
  background: rgba(255, 255, 255, 0.96) !important;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 22px;
  height: 64px;
  flex: 0 0 64px;
}

.header-left {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 8px;
}

.header-left h3 {
  min-width: 0;
  overflow: hidden;
  margin: 0;
  font-size: 18px;
  font-weight: 740;
  color: var(--text-primary);
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.menu-toggle {
  display: none;
  width: 36px;
  height: 36px;
  padding: 0 !important;
  font-size: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  min-height: 38px;
  gap: 9px;
  padding: 3px 7px 3px 5px;
  border-radius: var(--radius-md);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease;
}

.user-info:hover {
  background: var(--surface-page);
  border-color: var(--border-subtle);
}

.user-avatar {
  background: var(--accent-soft);
  color: #9a480b;
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
  padding: 22px;
  height: calc(100vh - 64px);
  overflow-y: auto;
}

.admin-content {
  min-height: 100%;
}

.aside-overlay {
  display: none;
}

@media (max-width: 900px) {
  .admin-aside {
    position: fixed;
    inset: 0 auto 0 0;
    transform: translateX(-100%);
    transition: transform 0.22s ease;
  }

  .admin-aside.is-open {
    transform: translateX(0);
  }

  .aside-overlay {
    position: fixed;
    inset: 0;
    z-index: 15;
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: rgba(24, 34, 41, 0.34);
  }

  .menu-toggle {
    display: inline-flex;
  }

  .admin-header {
    padding: 0 14px;
  }

  .admin-main {
    padding: 16px;
  }
}

@media (max-width: 640px) {
  .header-left h3 {
    font-size: 16px;
  }

  .user-details,
  .arrow-icon {
    display: none;
  }

  .user-info {
    padding-right: 4px;
  }
}

@media (max-width: 460px) {
  .header-right {
    gap: 2px;
  }

  .header-right :deep(.language-switch) {
    width: 126px;
  }

  .header-right :deep(.language-select) {
    width: 94px;
  }
}
</style>
