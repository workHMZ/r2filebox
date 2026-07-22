import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/home/index.vue'),
    meta: { titleKey: 'nav.home' },
  },
  {
    path: '/share/:code',
    name: 'ShareView',
    component: () => import('@/views/share/View.vue'),
    meta: { titleKey: 'nav.share' },
  },

  {
    path: '/admin/login',
    name: 'AdminLogin',
    component: () => import('@/views/admin/Login.vue'),
    meta: { titleKey: 'nav.adminLogin' },
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/views/admin/index.vue'),
    meta: { titleKey: 'nav.admin', requiresAuth: true, requiresAdmin: true },
    children: [
      {
        path: '',
        name: 'AdminDashboard',
        component: () => import('@/views/admin/Dashboard.vue'),
        meta: { titleKey: 'admin.dashboard' },
      },
      {
        path: 'dashboard',
        name: 'AdminDashboardAlias',
        component: () => import('@/views/admin/Dashboard.vue'),
        meta: { titleKey: 'admin.dashboard' },
      },
      {
        path: 'files',
        name: 'AdminFiles',
        component: () => import('@/views/admin/Files.vue'),
        meta: { titleKey: 'admin.files' },
      },

      {
        path: 'config',
        name: 'AdminConfig',
        component: () => import('@/views/admin/Config.vue'),
        meta: { titleKey: 'admin.config' },
      },
      {
        path: 'storage',
        name: 'AdminStorage',
        component: () => import('@/views/admin/Storage.vue'),
        meta: { titleKey: 'admin.storage' },
      },
      {
        path: 'logs',
        name: 'AdminLogs',
        component: () => import('@/views/admin/TransferLogs.vue'),
        meta: { titleKey: 'admin.logs' },
      },
      {
        path: 'maintenance',
        name: 'AdminMaintenance',
        component: () => import('@/views/admin/Maintenance.vue'),
        meta: { titleKey: 'admin.maintenance' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),  // 使用 hash 模式，避免与后端 API 路由冲突
  routes,
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const userStore = useUserStore()
  if (await userStore.checkSession()) return true

  return {
    path: '/admin/login',
    query: { redirect: to.fullPath },
  }
})

export default router
