import type { Share, AuditLog, UploadSession, Setting } from '../types'

export interface SystemStats {
  total_files: number
  text_shares: number
  total_shares: number
  active_shares: number
  expired_shares: number
  total_size: number
  total_storage_bytes: number
  today_uploads: number
  total_downloads: number
}

export interface UploadTrendPoint {
  date: string
  uploads: number
}

export interface FileTypeCount {
  mime_type: string
  count: number
}

export class DB {
  constructor(private db: D1Database) {}

  async createShare(share: Share, maxStorageBytes?: number): Promise<boolean> {
    const storageLimit = maxStorageBytes ?? null
    const stmt = this.db.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes, title,
        created_at, expire_at, deleted_at, max_downloads, download_count,
        created_ip_hash, last_access_at, object_etag, object_uploaded_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ? IS NULL OR (
        COALESCE((SELECT SUM(size_bytes) FROM shares WHERE deleted_at IS NULL), 0) +
        COALESCE((SELECT SUM(size_bytes) FROM upload_sessions), 0) +
        ? <= ?
      )
    `).bind(
      share.id,
      share.code_hash,
      share.type,
      share.r2_key,
      share.display_name,
      share.mime_type,
      share.size_bytes,
      share.title,
      share.created_at,
      share.expire_at,
      share.deleted_at,
      share.max_downloads,
      share.download_count,
      share.created_ip_hash,
      share.last_access_at,
      share.object_etag,
      share.object_uploaded_at,
      storageLimit,
      share.size_bytes,
      storageLimit,
    )
    const result = await stmt.run()
    return (result.meta.changes || 0) === 1
  }

  async getShareByCodeHash(codeHash: string): Promise<Share | null> {
    const stmt = this.db.prepare('SELECT * FROM shares WHERE code_hash = ? AND deleted_at IS NULL').bind(codeHash)
    return await stmt.first<Share>()
  }

  async getShareById(id: string): Promise<Share | null> {
    const stmt = this.db.prepare('SELECT * FROM shares WHERE id = ? AND deleted_at IS NULL').bind(id)
    return await stmt.first<Share>()
  }

  async consumeShareDownload(id: string): Promise<boolean> {
    const now = new Date().toISOString()
    const result = await this.db.prepare(`
      UPDATE shares
      SET download_count = download_count + 1, last_access_at = ?
      WHERE id = ?
        AND deleted_at IS NULL
        AND expire_at > ?
        AND (max_downloads IS NULL OR download_count < max_downloads)
    `).bind(now, id, now).run()
    return (result.meta.changes || 0) === 1
  }

  async deleteShareById(id: string): Promise<Share | null> {
    const share = await this.getShareById(id)
    if (!share) return null

    const now = new Date().toISOString()
    const stmt = this.db.prepare('UPDATE shares SET deleted_at = ? WHERE id = ?')
      .bind(now, id)
    await stmt.run()
    return share
  }

  async getSharesList(limit: number, offset: number): Promise<{items: Share[], total: number}> {
    const safeLimit = Math.min(Math.max(limit, 1), 100)
    const safeOffset = Math.max(offset, 0)

    const countStmt = this.db.prepare('SELECT count(*) as count FROM shares WHERE deleted_at IS NULL')
    const countRes = await countStmt.first<{count: number}>()
    
    const itemsStmt = this.db.prepare('SELECT * FROM shares WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .bind(safeLimit, safeOffset)
    const { results } = await itemsStmt.all<Share>()
    
    return {
      items: results,
      total: countRes?.count || 0
    }
  }


  async getSystemStats(): Promise<SystemStats> {
    const now = new Date().toISOString()
    const totalFilesStmt = this.db.prepare('SELECT count(*) as c FROM shares WHERE type = "file" AND deleted_at IS NULL')
    const totalSharesStmt = this.db.prepare('SELECT count(*) as c FROM shares WHERE deleted_at IS NULL')
    const activeSharesStmt = this.db.prepare('SELECT count(*) as c FROM shares WHERE deleted_at IS NULL AND expire_at > ?').bind(now)
    const textSharesStmt = this.db.prepare('SELECT count(*) as c FROM shares WHERE type = "text" AND deleted_at IS NULL')
    const expiredSharesStmt = this.db.prepare('SELECT count(*) as c FROM shares WHERE deleted_at IS NULL AND expire_at <= ?').bind(now)
    const totalSizeStmt = this.db.prepare('SELECT sum(size_bytes) as c FROM shares WHERE deleted_at IS NULL')
    const totalDownloadsStmt = this.db.prepare('SELECT sum(download_count) as c FROM shares WHERE deleted_at IS NULL')
    
    const today = new Date().toISOString().split('T')[0]
    const todayUploadsStmt = this.db.prepare('SELECT count(*) as c FROM shares WHERE created_at LIKE ? AND deleted_at IS NULL').bind(`${today}%`)

    const [files, total, active, text, expired, size, uploads, downloads] = await this.db.batch<{ c: number | null }>([
      totalFilesStmt,
      totalSharesStmt,
      activeSharesStmt,
      textSharesStmt,
      expiredSharesStmt,
      totalSizeStmt,
      todayUploadsStmt,
      totalDownloadsStmt,
    ])

    return {
      total_files: countResult(files),
      text_shares: countResult(text),
      total_shares: countResult(total),
      active_shares: countResult(active),
      expired_shares: countResult(expired),
      total_size: countResult(size),
      total_storage_bytes: countResult(size),
      today_uploads: countResult(uploads),
      total_downloads: countResult(downloads),
    }
  }

  async getUploadTrend(days: number): Promise<UploadTrendPoint[]> {
    const limit = Math.min(Math.max(days, 1), 30)
    const result = await this.db.prepare(`
      SELECT 
        date(created_at) as date,
        count(*) as uploads
      FROM shares
      WHERE created_at >= date('now', '-' || ? || ' days')
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
    `).bind(limit).all<UploadTrendPoint>()
    return result.results || []
  }

  async getFileTypeDistribution(): Promise<FileTypeCount[]> {
    const result = await this.db.prepare(`
      SELECT 
        CASE 
          WHEN type = 'text' THEN 'text/plain'
          ELSE COALESCE(mime_type, 'application/octet-stream')
        END as mime_type,
        count(*) as count
      FROM shares
      WHERE deleted_at IS NULL
      GROUP BY mime_type
      ORDER BY count DESC
      LIMIT 10
    `).all<FileTypeCount>()
    return result.results || []
  }

  async createUploadSession(session: UploadSession, maxStorageBytes: number): Promise<boolean> {
    const result = await this.db.prepare(`
      INSERT INTO upload_sessions (
        id, share_id, upload_id, code_hash, r2_key, display_name, mime_type,
        size_bytes, title, expire_at, max_downloads, created_ip_hash, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (
        COALESCE((SELECT SUM(size_bytes) FROM shares WHERE deleted_at IS NULL), 0) +
        COALESCE((SELECT SUM(size_bytes) FROM upload_sessions), 0) +
        ? <= ?
      )
    `).bind(
      session.id,
      session.share_id,
      session.upload_id,
      session.code_hash,
      session.r2_key,
      session.display_name,
      session.mime_type,
      session.size_bytes,
      session.title,
      session.expire_at,
      session.max_downloads,
      session.created_ip_hash,
      session.created_at,
      session.updated_at,
      session.size_bytes,
      maxStorageBytes,
    ).run()
    return (result.meta.changes || 0) === 1
  }

  async getUploadSession(id: string): Promise<UploadSession | null> {
    return await this.db.prepare('SELECT * FROM upload_sessions WHERE id = ?').bind(id).first<UploadSession>()
  }

  async deleteUploadSession(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM upload_sessions WHERE id = ?').bind(id).run()
  }

  async getExpiredUploadSessions(limit: number, staleBefore: string): Promise<UploadSession[]> {
    const now = new Date().toISOString()
    const safeLimit = Math.min(Math.max(limit, 1), 100)
    const stmt = this.db.prepare(`
      SELECT * FROM upload_sessions
      WHERE expire_at < ?
        OR created_at < ?
      ORDER BY created_at ASC
      LIMIT ?
    `).bind(now, staleBefore, safeLimit)

    const { results } = await stmt.all<UploadSession>()
    return results
  }

  async getExpiredShares(limit: number): Promise<Share[]> {
    const now = new Date().toISOString()
    const safeLimit = Math.min(Math.max(limit, 1), 100)
    const stmt = this.db.prepare(`
      SELECT * FROM shares 
      WHERE deleted_at IS NULL 
        AND expire_at < ? 
      LIMIT ?
    `).bind(now, safeLimit)
    
    const { results } = await stmt.all<Share>()
    return results
  }

  async incrementAbuseCounter(action: string, ipHash: string, bucketStart: string): Promise<number> {
    const key = `${action}:${ipHash}:${bucketStart}`
    const now = new Date().toISOString()
    await this.db.prepare(`
      INSERT INTO abuse_counters (key, action, ip_hash, bucket_start, count, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
    `).bind(key, action, ipHash, bucketStart, now).run()

    const row = await this.db.prepare('SELECT count FROM abuse_counters WHERE key = ?').bind(key).first<{count: number}>()
    return row?.count || 0
  }

  async purgeAbuseCounters(before: string): Promise<number> {
    const result = await this.db.prepare('DELETE FROM abuse_counters WHERE updated_at < ?').bind(before).run()
    return result.meta.changes || 0
  }

  async createAuditLog(log: AuditLog): Promise<void> {
    await this.db.prepare(`
      INSERT INTO audit_logs (id, action, share_id, ip_hash, user_agent_hash, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      log.id,
      log.action,
      log.share_id,
      log.ip_hash,
      log.user_agent_hash,
      log.status,
      log.created_at,
    ).run()
  }

  async getAuditLogs(limit: number, offset: number): Promise<{ items: AuditLog[], total: number }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100)
    const safeOffset = Math.max(offset, 0)
    const total = await this.db.prepare('SELECT count(*) as c FROM audit_logs').first<{ c: number }>()
    const { results } = await this.db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .bind(safeLimit, safeOffset)
      .all<AuditLog>()
    return { items: results, total: total?.c || 0 }
  }

  async getAuditStats(): Promise<{ total: number, uploads: number, downloads: number, activeUsers: number }> {
    const uploadStmt = this.db.prepare('SELECT count(*) as c FROM audit_logs WHERE action LIKE "%upload%"')
    const downloadStmt = this.db.prepare('SELECT count(*) as c FROM audit_logs WHERE action LIKE "%download%" OR action LIKE "%resolve%"')
    const totalStmt = this.db.prepare('SELECT count(*) as c FROM audit_logs')
    const activeUsersStmt = this.db.prepare('SELECT count(DISTINCT user_agent_hash) as c FROM audit_logs WHERE created_at >= ?')
      .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    const [total, uploads, downloads, activeUsers] = await this.db.batch<{ c: number | null }>([
      totalStmt,
      uploadStmt,
      downloadStmt,
      activeUsersStmt,
    ])
    return {
      total: countResult(total),
      uploads: countResult(uploads),
      downloads: countResult(downloads),
      activeUsers: countResult(activeUsers),
    }
  }

  async purgeAuditLogs(before: string): Promise<number> {
    const result = await this.db.prepare('DELETE FROM audit_logs WHERE created_at < ?').bind(before).run()
    return result.meta.changes || 0
  }

  async purgeDeletedShares(before: string): Promise<number> {
    const result = await this.db.prepare('DELETE FROM shares WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(before).run()
    return result.meta.changes || 0
  }

  async getSettings(): Promise<Record<string, string>> {
    const { results } = await this.db.prepare('SELECT key, value, updated_at FROM settings').all<Setting>()
    return Object.fromEntries(results.map((row) => [row.key, row.value]))
  }

  async upsertSettings(settings: Record<string, string>): Promise<void> {
    const now = new Date().toISOString()
    const entries = Object.entries(settings)
    if (!entries.length) return
    await this.db.batch(entries.map(([key, value]) => this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(key, value, now)))
  }

}

function countResult(result: D1Result<{ c: number | null }>): number {
  return Number(result.results[0]?.c || 0)
}
