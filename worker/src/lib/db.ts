import type { Share, AuditLog, UploadSession, Setting } from '../types'

export class DB {
  constructor(private db: D1Database) {}

  async createShare(share: Share): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes, title,
        created_at, expire_at, deleted_at, max_downloads, download_count,
        created_ip_hash, last_access_at, object_etag, object_uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    )
    await stmt.run()
  }

  async getShareByCodeHash(codeHash: string): Promise<Share | null> {
    const stmt = this.db.prepare('SELECT * FROM shares WHERE code_hash = ? AND deleted_at IS NULL').bind(codeHash)
    return await stmt.first<Share>()
  }

  async getShareById(id: string): Promise<Share | null> {
    const stmt = this.db.prepare('SELECT * FROM shares WHERE id = ? AND deleted_at IS NULL').bind(id)
    return await stmt.first<Share>()
  }

  async incrementShareDownloads(id: string): Promise<void> {
    const now = new Date().toISOString()
    const stmt = this.db.prepare('UPDATE shares SET download_count = download_count + 1, last_access_at = ? WHERE id = ?')
      .bind(now, id)
    await stmt.run()
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


  async getSystemStats(): Promise<any> {
    const totalFilesStmt = this.db.prepare('SELECT count(*) as c FROM shares WHERE type = "file" AND deleted_at IS NULL')
    const activeSharesStmt = this.db.prepare('SELECT count(*) as c FROM shares WHERE deleted_at IS NULL')
    const textSharesStmt = this.db.prepare('SELECT count(*) as c FROM shares WHERE type = "text" AND deleted_at IS NULL')
    const expiredSharesStmt = this.db.prepare('SELECT count(*) as c FROM shares WHERE deleted_at IS NULL AND expire_at < ?').bind(new Date().toISOString())
    const totalSizeStmt = this.db.prepare('SELECT sum(size_bytes) as s FROM shares WHERE deleted_at IS NULL')
    
    const today = new Date().toISOString().split('T')[0]
    const todayUploadsStmt = this.db.prepare('SELECT count(*) as c FROM shares WHERE created_at LIKE ? AND deleted_at IS NULL').bind(`${today}%`)
    const todayDownloadsStmt = this.db.prepare('SELECT sum(download_count) as c FROM shares WHERE last_access_at LIKE ? AND deleted_at IS NULL').bind(`${today}%`)

    const [files, active, text, expired, size, uploads, downloads] = await this.db.batch<any>([
      totalFilesStmt,
      activeSharesStmt,
      textSharesStmt,
      expiredSharesStmt,
      totalSizeStmt,
      todayUploadsStmt,
      todayDownloadsStmt,
    ])

    return {
      total_files: files.results[0].c || 0,
      text_shares: text.results[0].c || 0,
      total_shares: active.results[0].c || 0,
      active_shares: active.results[0].c || 0,
      expired_shares: expired.results[0].c || 0,
      total_size: size.results[0].s || 0,
      total_storage_bytes: size.results[0].s || 0,
      today_uploads: uploads.results[0].c || 0,
      today_downloads: downloads.results[0].c || 0,
    }
  }

  async getUploadTrend(days: number): Promise<any[]> {
    const limit = Math.min(Math.max(days, 1), 30)
    const result = await this.db.prepare(`
      SELECT 
        date(created_at) as date,
        count(*) as uploads
      FROM shares
      WHERE created_at >= date('now', '-' || ? || ' days')
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
    `).bind(limit).all()
    return result.results || []
  }

  async getFileTypeDistribution(): Promise<any[]> {
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
    `).all()
    return result.results || []
  }

  async getCurrentStorageBytes(): Promise<number> {
    const res = await this.db.prepare('SELECT sum(size_bytes) as s FROM shares WHERE deleted_at IS NULL').first<{s: number}>()
    return res?.s || 0
  }

  async createUploadSession(session: UploadSession): Promise<void> {
    await this.db.prepare(`
      INSERT INTO upload_sessions (
        id, share_id, upload_id, code_hash, r2_key, display_name, mime_type,
        size_bytes, title, expire_at, max_downloads, created_ip_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    ).run()
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
    const [total, uploads, downloads, activeUsers] = await this.db.batch<any>([
      totalStmt,
      uploadStmt,
      downloadStmt,
      activeUsersStmt,
    ])
    return {
      total: total.results[0].c || 0,
      uploads: uploads.results[0].c || 0,
      downloads: downloads.results[0].c || 0,
      activeUsers: activeUsers.results[0].c || 0,
    }
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
