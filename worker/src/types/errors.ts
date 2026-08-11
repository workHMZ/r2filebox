export const ErrorCode = {
  // Common errors (api.common.*)
  UNAUTHORIZED: 'api.common.unauthorized',
  FORBIDDEN: 'api.common.forbidden',
  NOT_FOUND: 'api.common.notFound',
  PAYLOAD_TOO_LARGE: 'api.common.payloadTooLarge',
  INVALID_FORMAT: 'api.common.invalidFormat',
  SERVICE_UNAVAILABLE: 'api.common.serviceUnavailable',
  INTERNAL_SERVER_ERROR: 'api.common.internalError',
  RATE_LIMIT_EXCEEDED: 'api.common.rateLimit',
  TURNSTILE_FAILED: 'api.common.turnstileFailed',

  // Share and retrieval errors (api.share.*)
  SHARE_NOT_FOUND: 'api.share.notFound',
  TEXT_SHARE_DISABLED: 'api.share.textDisabled',
  TEXT_CONTENT_EMPTY: 'api.share.textEmpty',
  STORAGE_WRITE_FAILED: 'api.share.storageWriteFailed',
  STORAGE_LIMIT_REACHED: 'api.share.storageLimitReached',
  FILE_SHARE_DISABLED: 'api.share.fileDisabled',
  INVALID_FILE_SIZE: 'api.share.invalidFileSize',
  FILE_TOO_LARGE: 'api.share.fileTooLarge',
  INVALID_UPLOAD_SESSION: 'api.share.invalidUploadSession',
  INVALID_PART_NUMBER: 'api.share.invalidPartNumber',
  MISSING_PART_CONTENT: 'api.share.missingPartContent',
  UPLOAD_SESSION_NOT_FOUND: 'api.share.uploadSessionNotFound',
  UPLOAD_SESSION_EXPIRED: 'api.share.uploadSessionExpired',
  PART_TOO_LARGE: 'api.share.partTooLarge',
  PART_INCOMPLETE_RETRY: 'api.share.partIncompleteRetry',
  INVALID_COMPLETE_INFO: 'api.share.invalidCompleteInfo',
  MISSING_COMPLETE_INFO: 'api.share.missingCompleteInfo',
  INCOMPLETE_COMPLETE_INFO: 'api.share.incompleteCompleteInfo',
  SIZE_MISMATCH: 'api.share.sizeMismatch',

  // Admin errors (api.admin.*)
  INVALID_CREDENTIALS: 'api.admin.invalidCredentials',
  FILE_NOT_FOUND: 'api.admin.fileNotFound',
  INVALID_CONFIG: 'api.admin.invalidConfig',
  TURNSTILE_CONFIG_MISSING: 'api.admin.turnstileConfigMissing',
} as const

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode]
