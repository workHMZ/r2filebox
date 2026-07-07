import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

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

// 路由守卫
router.beforeEach((to, _from, next) => {
  // 检查是否需要登录
  if (to.meta.requiresAuth) {
    const token = localStorage.getItem('token')
    if (!token) {
      // 如果是管理后台，跳转到管理员登录页面
      next('/admin/login')
      return
    }

    // 检查是否需要管理员权限
    if (to.meta.requiresAdmin) {
      const userRole = localStorage.getItem('userRole')
      if (userRole !== 'admin') {
        next('/admin/login')
        return
      }
    }
  }

  next()
})

export default router
