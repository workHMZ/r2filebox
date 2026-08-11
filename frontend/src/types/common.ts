export interface ApiResponse<T = unknown> {
  code: number
  error_code?: string
  message: string
  params?: Record<string, string | number>
  data: T
  success: boolean
}
