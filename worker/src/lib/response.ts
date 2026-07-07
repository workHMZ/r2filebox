export const success = (data: any = null, message = 'success') => {
  return {
    code: 200,
    message,
    data,
    success: true,
  }
}

export const error = (message = 'error', code = 400, data: any = null) => {
  return {
    code,
    message,
    data,
    success: false,
  }
}
