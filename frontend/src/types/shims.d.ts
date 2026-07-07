declare module '@/api/share' {
  export const shareApi: any
}

declare module '@/api/admin' {
  export const adminApi: any
}

declare module '@/api' {
  export * from '@/api/share'
  export * from '@/api/admin'
}

declare module '@/types/share' {
  export interface ShareInfo {
    code: string
    filename: string
    file_size: number
    content_type: 'text' | 'file'
    content?: string
    has_password: boolean
    created_at: string
    expire_time?: string
    download_count: number
    max_downloads?: number
    username?: string
  }
}