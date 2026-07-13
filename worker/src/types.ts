export interface Env {
  [key: string]: unknown
  
  DB: D1Database
  BUCKET: R2Bucket
  RATE_LIMIT: KVNamespace
  ASSETS: Fetcher
  
  APP_NAME?: string
  APP_DESCRIPTION?: string
  APP_VERSION: string
  R2_BUCKET_NAME: string
  D1_DATABASE_NAME: string
  CODE_LENGTH: string
  MAX_UPLOAD_BYTES: string
  MAX_TOTAL_STORAGE_BYTES: string
  DEFAULT_EXPIRE_HOURS: string
  MAX_EXPIRE_HOURS: string
  DEFAULT_MAX_DOWNLOADS: string
  ENABLE_TEXT_SHARE: string
  ENABLE_FILE_SHARE: string
  ENABLE_PUBLIC_UPLOAD: string
  ENABLE_AUDIT_LOG: string
  ENABLE_ACCESS_LOG: string
  ENABLE_KV_RATE_LIMIT: string
  REQUIRE_TURNSTILE: string
  TURNSTILE_SITE_KEY?: string
  CLEANUP_BATCH_SIZE: string
  RATE_LIMIT_UPLOAD_PER_MINUTE: string
  RATE_LIMIT_UPLOAD_PART_PER_MINUTE: string
  RATE_LIMIT_RESOLVE_PER_MINUTE: string
  RATE_LIMIT_DOWNLOAD_PER_MINUTE: string
  RATE_LIMIT_AUTH_PER_15_MIN: string
  
  ADMIN_USERNAME?: string
  ADMIN_PASSWORD?: string
  ADMIN_PASSWORD_HASH?: string
  CODE_HASH_PEPPER?: string
  SESSION_SECRET?: string
  TURNSTILE_SECRET_KEY?: string
}

export interface Share {
  id: string
  code_hash: string
  type: 'text' | 'file'
  r2_key: string
  display_name: string | null
  mime_type: string | null
  size_bytes: number
  title: string | null
  created_at: string
  expire_at: string
  deleted_at: string | null
  max_downloads: number | null
  download_count: number
  created_ip_hash: string | null
  last_access_at: string | null
  object_etag: string | null
  object_uploaded_at: string | null
}

export interface UploadSession {
  id: string
  share_id: string
  upload_id: string
  code_hash: string
  r2_key: string
  display_name: string
  mime_type: string
  size_bytes: number
  title: string | null
  expire_at: string
  max_downloads: number | null
  created_ip_hash: string | null
  created_at: string
  updated_at: string
}



export interface Setting {
  key: string
  value: string
  updated_at: string
}

export interface AuditLog {
  id: string
  action: string
  share_id: string | null
  ip_hash: string | null
  user_agent_hash: string | null
  status: string
  created_at: string
}
