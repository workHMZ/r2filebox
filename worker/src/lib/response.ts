import type { ErrorCode } from '../types/errors'

export interface ApiSuccessResponse<T = unknown> {
  code: 200
  message: string
  data: T
  success: true
}

export interface ApiErrorResponse {
  code: number
  error_code: ErrorCode
  message: string
  params?: Record<string, string | number>
  data: null
  success: false
}

export const success = <T = unknown>(data: T = null as T, message = 'success'): ApiSuccessResponse<T> => {
  return {
    code: 200,
    message,
    data,
    success: true,
  }
}

export const error = (
  errorCode: ErrorCode,
  code = 400,
  defaultMessage = 'An error occurred',
  params?: Record<string, string | number>
): ApiErrorResponse => {
  return {
    code,
    error_code: errorCode,
    message: defaultMessage,
    params,
    data: null,
    success: false,
  }
}
