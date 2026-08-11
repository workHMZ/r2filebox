const TERMINAL_UPLOAD_STATUSES = new Set([400, 401, 404, 410, 413])

export function isTerminalUploadError(error: unknown): boolean {
  const status = readStatus(error)
  return status !== undefined && TERMINAL_UPLOAD_STATUSES.has(status)
}

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined

  const directStatus = (error as { status?: unknown }).status
  if (typeof directStatus === 'number') return directStatus

  const response = (error as { response?: unknown }).response
  if (!response || typeof response !== 'object') return undefined
  const responseStatus = (response as { status?: unknown }).status
  return typeof responseStatus === 'number' ? responseStatus : undefined
}
