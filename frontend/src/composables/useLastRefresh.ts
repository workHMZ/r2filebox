import { ref, computed } from 'vue'
import { formatClockTime } from '@/utils/format'

export function useLastRefresh() {
  const lastRefreshedAt = ref<Date>(new Date())

  const lastRefreshTime = computed(() => formatClockTime(lastRefreshedAt.value))

  const markRefreshed = () => {
    lastRefreshedAt.value = new Date()
  }

  return {
    lastRefreshedAt,
    lastRefreshTime,
    markRefreshed
  }
}
