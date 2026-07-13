import { defineStore } from 'pinia'
import { adminApi } from '@/api/admin'

export const useUserStore = defineStore('user', () => {
  const login = async (username: string, password: string) => {
    const res = await adminApi.login({ username, password })
    if (res.code === 200) {
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('userRole', res.data.user.role || 'user')
      return true
    }
    throw new Error(res.message)
  }

  const logout = async (): Promise<boolean> => {
    let serverLoggedOut = true
    try {
      await adminApi.logout()
    } catch {
      serverLoggedOut = false
    } finally {
      localStorage.removeItem('token')
      localStorage.removeItem('userRole')
    }
    return serverLoggedOut
  }
  return {
    login,
    logout,
  }
})
