import { hasKey, t } from '@/i18n'
import type { ApiResponse } from '@/types/common'

export class ApiError extends Error {
  readonly status: number
  readonly errorCode?: string
  readonly params?: Record<string, string | number>
  readonly rawMessage: string

  constructor(
    message: string,
    status: number,
    errorCode?: string,
    params?: Record<string, string | number>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errorCode = errorCode
    this.params = params
    this.rawMessage = message
  }
}

export function formatApiError(
  err: Partial<ApiResponse> | ApiError | Error | unknown,
  fallbackMessageKey = 'request.failed',
): string {
  if (!err) return t(fallbackMessageKey)

  const errorCode = (err as ApiResponse).error_code || (err as ApiError).errorCode
  const params = (err as ApiResponse).params || (err as ApiError).params || {}

  // 1. 优先使用 errorCode 匹配 i18n 字典中的词条（例如 'api.share.notFound'）
  if (errorCode && hasKey(errorCode)) {
    return t(errorCode, params)
  }

  // 2. 降级使用后端返回的标准英文原文短语 (rawMessage)
  const rawMessage = (err as ApiError).rawMessage || (err as ApiResponse).message || (err as Error).message
  if (rawMessage && typeof rawMessage === 'string' && !rawMessage.startsWith('api.')) {
    return rawMessage
  }

  // 3. 通用保底词条
  return t(fallbackMessageKey)
}
