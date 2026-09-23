<template>
  <div class="admin-layout">
    <el-container class="admin-container">
      <el-aside
        id="admin-sidebar"
        ref="sidebarRef"
        width="224px"
        :class="['admin-aside', { 'is-open': sidebarOpen }]"
        role="navigation"
        :aria-label="t('a11y.adminNavigation')"
        :aria-hidden="sidebarInactive ? 'true' : undefined"
        :inert="sidebarInactive || undefined"
        @keydown="handleSidebarKeydown"
      >
        <div class="admin-logo">
          <AppLogo size="small" />
          <div class="logo-text">
            <h2>{{ configStore.siteName }}</h2>
            <p>{{ t('admin.subtitle') }}</p>
          </div>
          <el-button
            class="sidebar-close"
            text
            :aria-label="t('a11y.closeNavigation')"
            :title="t('a11y.closeNavigation')"
            @click="closeSidebar()"
          >
            <el-icon aria-hidden="true"><Close /></el-icon>
          </el-button>
        </div>
        
        <ul class="admin-menu">
          <li v-for="item in adminMenuItems" :key="item.path" class="admin-menu-item">
            <RouterLink
              :to="item.path"
              class="admin-menu-link"
              :class="{ 'is-active': isMenuItemActive(item.path) }"
              :aria-current="isMenuItemActive(item.path) ? 'page' : undefined"
              exact-active-class="is-active"
              @click="handleMenuSelect"
            >
              <el-icon aria-hidden="true"><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </RouterLink>
          </li>
        </ul>

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
        tabindex="-1"
        :aria-label="t('a11y.closeNavigation')"
        @click="closeSidebar()"
      ></button>
      
      <el-container
        class="main-container"
        :aria-hidden="backgroundInactive ? 'true' : undefined"
        :inert="backgroundInactive || undefined"
      >
        <el-header class="admin-header">
          <div class="header-left">
            <el-button
              ref="menuToggleRef"
              class="menu-toggle"
              text
              :aria-label="t('a11y.openNavigation')"
              :aria-expanded="sidebarOpen"
              aria-controls="admin-sidebar"
              :title="t('a11y.openNavigation')"
              @click="openSidebar"
            >
              <el-icon><Expand /></el-icon>
            </el-button>
            <h3 id="admin-page-title">{{ pageTitle }}</h3>
          </div>
          
          <div class="header-right">
            <InterfaceControls />
            <button
              class="user-info"
              type="button"
              :disabled="loggingOut"
              :aria-busy="loggingOut || undefined"
              :aria-label="t('admin.logout')"
              :title="t('admin.logout')"
              @click="confirmLogout"
            >
              <el-avatar :size="32" class="user-avatar">
                {{ adminInitial }}
              </el-avatar>
              <div class="user-details">
                <span class="user-name" :title="adminDisplayName">{{ adminDisplayName }}</span>
                <span class="user-role">{{ t('admin.role') }}</span>
              </div>
              <el-icon class="logout-icon" :class="{ 'is-loading': loggingOut }">
                <Loading v-if="loggingOut" />
                <SwitchButton v-else />
              </el-icon>
            </button>
          </div>
        </el-header>
        
        <el-main
          id="main-content"
          class="admin-main"
          tabindex="-1"
          aria-labelledby="admin-page-title"
        >
          <div class="admin-content">
            <router-view />
          </div>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { RouterLink, useRouter, useRoute } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Close,
  Document,
  Expand,
  Folder,
  Loading,
  Monitor,
  Promotion,
  Setting,
  SwitchButton,
  Tools,
} from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useConfigStore } from '@/stores/config'
import { useI18n } from '@/i18n'
import InterfaceControls from '@/components/InterfaceControls.vue'
import AppLogo from '@/components/AppLogo.vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const configStore = useConfigStore()
const { t } = useI18n()
const sidebarOpen = ref(false)
// Matches the drawer breakpoint in this file's stylesheet: above it the aside
// is a static column, below it a modal drawer that traps focus.
const isMobile = useMediaQuery('(max-width: 1023px)')
const loggingOut = ref(false)
const sidebarRef = ref<HTMLElement | ComponentPublicInstance | null>(null)
const menuToggleRef = ref<HTMLElement | ComponentPublicInstance | null>(null)

const sidebarInactive = computed(() => isMobile.value && !sidebarOpen.value)
const backgroundInactive = computed(() => isMobile.value && sidebarOpen.value)
const adminDisplayName = computed(() => userStore.user?.username.trim() || t('common.admin'))
const adminInitial = computed(() => Array.from(adminDisplayName.value)[0]?.toLocaleUpperCase() || 'A')
const adminMenuItems = computed(() => [
  { path: '/admin/dashboard', label: t('admin.dashboard'), icon: Monitor },
  { path: '/admin/files', label: t('admin.files'), icon: Folder },
  { path: '/admin/logs', label: t('admin.logs'), icon: Document },
  { path: '/admin/config', label: t('admin.config'), icon: Setting },
  { path: '/admin/maintenance', label: t('admin.maintenance'), icon: Tools },
])

const isMenuItemActive = (path: string) => (
  route.path === path || (path === '/admin/dashboard' && route.path === '/admin')
)

const pageTitle = computed(() => {
  const titles: Record<string, string> = {
    '/admin/dashboard': t('admin.dashboard'),
    '/admin': t('admin.dashboard'),
    '/admin/files': t('admin.files'),
    '/admin/config': t('admin.config'),
    '/admin/logs': t('admin.logs'),
    '/admin/maintenance': t('admin.maintenance')
  }
  return titles[route.path] || t('admin.title')
})

const goToUser = () => {
  window.open('/', '_blank', 'noopener,noreferrer')
}

const resolveElement = (target: HTMLElement | ComponentPublicInstance | null): HTMLElement | null => {
  if (target instanceof HTMLElement) return target
  return target?.$el instanceof HTMLElement ? target.$el : null
}

const focusMenuToggle = () => {
  resolveElement(menuToggleRef.value)?.focus()
}

const openSidebar = async () => {
  if (!isMobile.value) return
  sidebarOpen.value = true
  await nextTick()
  const sidebar = resolveElement(sidebarRef.value)
  const activeMenuItem = sidebar?.querySelector<HTMLElement>('.admin-menu-link.is-active')
  const firstMenuItem = sidebar?.querySelector<HTMLElement>('.admin-menu-link')
  const firstControl = sidebar?.querySelector<HTMLElement>('button:not([disabled]), a[href]')
  const focusTarget = activeMenuItem || firstMenuItem || firstControl
  focusTarget?.focus()
}

const closeSidebar = async (restoreFocus = true) => {
  const wasOpen = sidebarOpen.value
  sidebarOpen.value = false
  if (wasOpen && restoreFocus) {
    await nextTick()
    focusMenuToggle()
  }
}

const handleMenuSelect = () => {
  void closeSidebar()
}

const handleSidebarKeydown = (event: KeyboardEvent) => {
  if (!isMobile.value || !sidebarOpen.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    void closeSidebar()
    return
  }

  if (event.key !== 'Tab') return
  const sidebar = resolveElement(sidebarRef.value)
  if (!sidebar) return

  const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hasAttribute('inert') && element.getAttribute('aria-hidden') !== 'true')
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return

  const activeElement = document.activeElement
  if (event.shiftKey && (activeElement === first || !sidebar.contains(activeElement))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (activeElement === last || !sidebar.contains(activeElement))) {
    event.preventDefault()
    first.focus()
  }
}

// Growing past the breakpoint would leave the drawer open over a static
// column, and navigating should never leave it covering the page it moved to.
watch([isMobile, () => route.path], () => {
  void closeSidebar(false)
})

const confirmLogout = async () => {
  try {
    await ElMessageBox.confirm(t('admin.logoutConfirm'), t('admin.logoutTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
    })
    loggingOut.value = true
    const serverLoggedOut = await userStore.logout()
    if (serverLoggedOut) {
      ElMessage.success(t('admin.logoutDone'))
    } else {
      ElMessage.warning(t('request.network'))
    }
    await router.push('/admin/login')
  } catch (error: unknown) {
    if (error !== 'cancel' && error !== 'close') {
      console.error('Logout failed:', error)
    }
  } finally {
    loggingOut.value = false
  }
}
</script>

<style scoped>
/* The shell owns the full viewport under viewport-fit=cover, so it carries the
   status-bar inset itself; box-sizing keeps 100dvh inclusive of it. */
.admin-layout {
  position: relative;
  height: 100vh;
  height: 100dvh;
  padding-top: env(safe-area-inset-top, 0px);
  overflow: hidden;
  background: var(--surface-canvas);
}

.admin-container {
  position: relative;
  height: 100%;
  z-index: 1;
}

.main-container {
  display: flex;
  min-width: 0;
  height: 100%;
  flex-direction: column;
}

/* ---- Sidebar ----------------------------------------------------------- */
.admin-aside {
  display: flex;
  z-index: 20;
  flex-direction: column;
  background: var(--surface-page) !important;
  border-right: 1px solid var(--border-subtle);
}

.admin-logo {
  display: flex;
  height: 64px;
  align-items: center;
  gap: var(--space-2xs);
  padding: 0 var(--space-sm);
  border-bottom: 1px solid var(--border-subtle);
}

.logo-text {
  min-width: 0;
  flex: 1;
}

.logo-text h2 {
  overflow: hidden;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: var(--fs-title-md);
  font-weight: 600;
  letter-spacing: var(--tracking-display);
  line-height: 1.2;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logo-text p {
  overflow: hidden;
  color: var(--text-secondary);
  font-family: var(--font-code);
  font-size: var(--fs-caption-up);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-menu {
  flex: 1;
  padding: var(--space-xs) 0;
  list-style: none;
}

.admin-menu-item {
  list-style: none;
}

/* Each entry is a ledger line; the active one grows the coral binding mark. */
.admin-menu-link {
  display: flex;
  height: 40px;
  align-items: center;
  padding: 0 var(--space-sm);
  border-left: 2px solid transparent;
  color: var(--text-secondary);
  font-size: var(--fs-body-sm);
  font-weight: 500;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.admin-menu-link:hover {
  background: var(--surface-card);
  color: var(--text-primary);
}

.admin-menu-link.is-active {
  border-left-color: var(--primary-color);
  background: var(--surface-card);
  color: var(--text-primary);
  font-weight: 600;
}

.admin-menu :deep(.el-icon) {
  margin-right: var(--space-2xs);
  font-size: var(--fs-title-sm);
}

.sidebar-footer {
  padding: var(--space-xs);
  padding-bottom: max(var(--space-xs), env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border-subtle);
}

.user-page-btn {
  width: 100%;
  height: 36px;
  font-size: var(--fs-caption);
}

/* ---- Header ------------------------------------------------------------ */
.admin-header {
  display: flex;
  height: 64px;
  flex: 0 0 64px;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-md);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-translucent) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.header-left {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: var(--space-2xs);
}

.header-left h3 {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-family: var(--font-primary);
  font-size: var(--fs-title-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-2xs);
}

.menu-toggle {
  display: none;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0 !important;
  font-size: var(--fs-title-lg);
}

.sidebar-close {
  display: none;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  flex: 0 0 44px;
  margin-left: auto;
  padding: 0 !important;
  font-size: var(--fs-title-md);
}

.user-info {
  display: flex;
  min-width: 0;
  min-height: 36px;
  max-width: min(252px, 30vw);
  align-items: center;
  gap: var(--space-2xs);
  padding: var(--space-3xs) var(--space-xs) var(--space-3xs) var(--space-3xs);
  appearance: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  background: var(--surface-page);
  color: inherit;
  cursor: pointer;
  font: inherit;
  transition: background 0.18s ease, border-color 0.18s ease;
}

.user-info:hover {
  border-color: var(--control-border);
  background: var(--surface-card);
}

.user-info:disabled {
  cursor: wait;
  opacity: 0.72;
}

.user-avatar {
  flex: 0 0 auto;
  background: var(--primary-strong) !important;
  color: var(--text-on-primary) !important;
  font-weight: 600;
}

.user-details {
  display: flex;
  min-width: 0;
  max-width: 178px;
  flex-direction: column;
  text-align: left;
}

.user-name {
  display: block;
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--fs-caption);
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-role {
  color: var(--text-secondary);
  font-size: var(--fs-caption-up);
  line-height: 1.3;
}

.logout-icon {
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-size: var(--fs-title-sm);
  transition: color 0.18s ease;
}

.user-info:hover .logout-icon {
  color: var(--danger-ink);
}

.logout-icon.is-loading {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---- Content ----------------------------------------------------------- */
.admin-main {
  --main-inset: var(--space-md);
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--main-inset);
  padding-bottom: max(var(--main-inset), env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.admin-content {
  min-height: 100%;
}

.aside-overlay {
  display: none;
}

@media (max-width: 1023px) {
  /* As a drawer it is not competing with the content for width, and 224px
     clipped the Japanese subtitle to 'コントロールセン…'. */
  .admin-aside {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(272px, 84vw) !important;
    /* position: fixed resolves against the viewport, so this drawer never
       inherits the shell's status-bar inset and has to carry its own. */
    padding-top: env(safe-area-inset-top, 0px);
    box-shadow: var(--shadow-raised);
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
    background: var(--overlay-scrim);
  }

  .menu-toggle,
  .sidebar-close {
    display: inline-flex;
  }
}

@media (max-width: 767px) {
  .admin-header {
    padding: 0 var(--space-xs);
  }

  .admin-main {
    --main-inset: var(--space-sm);
  }

  /* 'ダッシュボード' needs 125px at 18px but the row only frees 129px once the
     menu toggle and the right-hand controls are placed. */
  .header-left h3 {
    font-size: var(--fs-title-sm);
  }

  .user-details,
  .logout-icon {
    display: none;
  }

  .user-info {
    padding-right: var(--space-3xs);
  }
}

@media (prefers-reduced-motion: reduce) {
  .logout-icon,
  .logout-icon.is-loading {
    animation: none;
    transition: none;
  }
}
</style>
