import { defineStore } from 'pinia'
import { ref } from 'vue'
import { adminApi } from '@/api/admin'
import type { AdminUser } from '@/api/admin'

export const useUserStore = defineStore('user', () => {
  const authenticated = ref(false)
  const user = ref<AdminUser | null>(null)
  let sessionRequest: Promise<boolean> | null = null

  const login = async (username: string, password: string) => {
    const res = await adminApi.login({ username, password })
    if (res.code === 200) {
      authenticated.value = true
      user.value = res.data.user
      return true
    }
    throw new Error(res.message)
  }

  const checkSession = async (): Promise<boolean> => {
    if (authenticated.value) return true
    if (sessionRequest) return sessionRequest

    sessionRequest = (async () => {
      try {
        const res = await adminApi.getSession()
        authenticated.value = res.code === 200
        user.value = authenticated.value ? res.data.user : null
        return authenticated.value
      } catch {
        authenticated.value = false
        user.value = null
        return false
      } finally {
        sessionRequest = null
      }
    })()
    return sessionRequest
  }

  const logout = async (): Promise<boolean> => {
    let serverLoggedOut = true
    try {
      await adminApi.logout()
    } catch {
      serverLoggedOut = false
    } finally {
      authenticated.value = false
      user.value = null
    }
    return serverLoggedOut
  }
  return {
    authenticated,
    user,
    login,
    checkSession,
    logout,
  }
})
