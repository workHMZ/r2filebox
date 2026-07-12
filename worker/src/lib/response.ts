export const success = (data: unknown = null, message = 'success') => {
  return {
    code: 200,
    message,
    data,
    success: true,
  }
}

export const error = (message = 'error', code = 400, data: unknown = null) => {
  return {
    code,
    message,
    data,
    success: false,
  }
}
