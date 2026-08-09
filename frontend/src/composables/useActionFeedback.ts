import { onBeforeUnmount, ref } from 'vue'

export const useActionFeedback = (duration = 1500) => {
  const active = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  const reset = () => {
    if (timer) clearTimeout(timer)
    timer = null
    active.value = false
  }

  const show = () => {
    reset()
    active.value = true
    timer = setTimeout(() => {
      active.value = false
      timer = null
    }, duration)
  }

  onBeforeUnmount(reset)

  return {
    active,
    reset,
    show,
  }
}
