interface SecretBindings {
  REQUIRE_TURNSTILE?: string
  TURNSTILE_SITE_KEY?: string
  ADMIN_USERNAME?: string
  ADMIN_PASSWORD?: string
  ADMIN_PASSWORD_HASH?: string
  CODE_HASH_PEPPER?: string
  SESSION_SECRET?: string
  TURNSTILE_SECRET_KEY?: string
}

export type Env = CloudflareBindings & SecretBindings

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
  subject_type: string | null
  subject_name: string | null
  size_bytes: number | null
  ip_hash: string | null
  user_agent_hash: string | null
  status: string
  created_at: string
}
