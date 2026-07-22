import type { Share, AuditLog, UploadSession, Setting } from '../types'

export interface SystemStats {
  total_files: number
  text_shares: number
  total_shares: number
  active_shares: number
  expired_shares: number
  total_size: number
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

export interface AuditLogDetails {
  id: string
  action: string
  share_id: string | null
  subject_type: string | null
  ip_hash: string | null
  status: string
  created_at: string
  subject_name: string | null
  size_bytes: number | null
}

export interface AuditStats {
  total: number
  completedShares: number
  completedRetrievals: number
  activeSources: number
}

export class DB {
  constructor(private db: D1Database) {}

  async createShare(share: Share, maxStorageBytes: number): Promise<boolean> {
    const created = await this.prepareCreateShare(share, maxStorageBytes).first<{ id: string }>()
    return created?.id === share.id
  }

  async completeUploadSession(share: Share, session: UploadSession): Promise<void> {
    const insertShare = this.db.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes, title,
        created_at, expire_at, deleted_at, max_downloads, download_count,
        created_ip_hash, last_access_at, object_etag, object_uploaded_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1
        FROM upload_sessions
        WHERE id = ? AND share_id = ? AND upload_id = ? AND r2_key = ?
      )
      RETURNING id
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
      session.id,
      session.share_id,
      session.upload_id,
      session.r2_key,
    )
    const deleteSession = this.db.prepare(`
      DELETE FROM upload_sessions
      WHERE id = ? AND share_id = ? AND upload_id = ? AND r2_key = ?
      RETURNING id
    `).bind(session.id, session.share_id, session.upload_id, session.r2_key)
    const [created, removed] = await this.db.batch([insertShare, deleteSession])
    const createdIds = created.results as Array<{ id?: string }>
    const removedIds = removed.results as Array<{ id?: string }>
    if (createdIds[0]?.id !== share.id || removedIds[0]?.id !== session.id) {
      throw new Error('Upload session changed before completion')
    }
  }

  private prepareCreateShare(share: Share, maxStorageBytes: number): D1PreparedStatement {
    return this.db.prepare(`
      INSERT INTO shares (
        id, code_hash, type, r2_key, display_name, mime_type, size_bytes, title,
        created_at, expire_at, deleted_at, max_downloads, download_count,
        created_ip_hash, last_access_at, object_etag, object_uploaded_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE COALESCE((SELECT active_bytes FROM storage_usage WHERE id = 1), 0) + ? <= ?
      RETURNING id
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
      share.size_bytes,
      maxStorageBytes,
    )
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
    const todayStart = `${now.slice(0, 10)}T00:00:00.000Z`
    const tomorrowStart = new Date(Date.parse(todayStart) + 24 * 60 * 60 * 1000).toISOString()
    const stats = await this.db.prepare(`
      SELECT
        SUM(CASE WHEN type = 'file' THEN 1 ELSE 0 END) AS total_files,
        SUM(CASE WHEN type = 'text' THEN 1 ELSE 0 END) AS text_shares,
        COUNT(*) AS total_shares,
        SUM(CASE WHEN expire_at > ? THEN 1 ELSE 0 END) AS active_shares,
        SUM(CASE WHEN expire_at <= ? THEN 1 ELSE 0 END) AS expired_shares,
        COALESCE(SUM(size_bytes), 0) AS total_size,
        SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS today_uploads,
        COALESCE(SUM(download_count), 0) AS total_downloads
      FROM shares
      WHERE deleted_at IS NULL
    `).bind(now, now, todayStart, tomorrowStart).first<{
      total_files: number | null
      text_shares: number | null
      total_shares: number | null
      active_shares: number | null
      expired_shares: number | null
      total_size: number | null
      today_uploads: number | null
      total_downloads: number | null
    }>()

    return {
      total_files: Number(stats?.total_files || 0),
      text_shares: Number(stats?.text_shares || 0),
      total_shares: Number(stats?.total_shares || 0),
      active_shares: Number(stats?.active_shares || 0),
      expired_shares: Number(stats?.expired_shares || 0),
      total_size: Number(stats?.total_size || 0),
      today_uploads: Number(stats?.today_uploads || 0),
      total_downloads: Number(stats?.total_downloads || 0),
    }
  }

  async getUploadTrend(days: number): Promise<UploadTrendPoint[]> {
    const limit = Math.min(Math.max(days, 1), 30)
    const start = new Date()
    start.setUTCHours(0, 0, 0, 0)
    start.setUTCDate(start.getUTCDate() - (limit - 1))
    const result = await this.db.prepare(`
      SELECT 
        date(created_at) as date,
        count(*) as uploads
      FROM shares
      WHERE created_at >= ?
        AND deleted_at IS NULL
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
    `).bind(start.toISOString()).all<UploadTrendPoint>()
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
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 10
    `).all<FileTypeCount>()
    return result.results || []
  }

  async createUploadSession(session: UploadSession, maxStorageBytes: number): Promise<boolean> {
    const created = await this.db.prepare(`
      INSERT INTO upload_sessions (
        id, share_id, upload_id, code_hash, r2_key, display_name, mime_type,
        size_bytes, title, expire_at, max_downloads, created_ip_hash, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (
        COALESCE((SELECT active_bytes FROM storage_usage WHERE id = 1), 0) + ? <= ?
      )
      RETURNING id
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
    ).first<{ id: string }>()
    return created?.id === session.id
  }

  async getUploadSession(id: string): Promise<UploadSession | null> {
    return await this.db.prepare('SELECT * FROM upload_sessions WHERE id = ?').bind(id).first<UploadSession>()
  }

  async deleteUploadSession(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM upload_sessions WHERE id = ?').bind(id).run()
  }

  async deleteUploadSessionsByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0
    const { results } = await this.db.prepare(`
      DELETE FROM upload_sessions
      WHERE id IN (SELECT value FROM json_each(?))
      RETURNING id
    `).bind(JSON.stringify(ids)).all<{ id: string }>()
    return results.length
  }

  async getActiveShareKeys(ids: string[]): Promise<Array<{ id: string; r2_key: string }>> {
    if (!ids.length) return []
    const { results } = await this.db.prepare(`
      SELECT id, r2_key
      FROM shares
      WHERE deleted_at IS NULL
        AND id IN (SELECT value FROM json_each(?))
    `).bind(JSON.stringify(ids)).all<{ id: string; r2_key: string }>()
    return results
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
      ORDER BY expire_at ASC
      LIMIT ?
    `).bind(now, safeLimit)
    
    const { results } = await stmt.all<Share>()
    return results
  }

  async markSharesDeletedByIds(ids: string[], deletedAt: string): Promise<number> {
    if (!ids.length) return 0
    const { results } = await this.db.prepare(`
      UPDATE shares
      SET deleted_at = ?
      WHERE deleted_at IS NULL
        AND id IN (SELECT value FROM json_each(?))
      RETURNING id
    `).bind(deletedAt, JSON.stringify(ids)).all<{ id: string }>()
    return results.length
  }

  async incrementAbuseCounter(
    action: string,
    ipHash: string,
    bucketStart: string,
    maxCount: number,
  ): Promise<number> {
    const key = `${action}:${ipHash}:${bucketStart}`
    const now = new Date().toISOString()
    const row = await this.db.prepare(`
      INSERT INTO abuse_counters (key, action, ip_hash, bucket_start, count, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
      WHERE abuse_counters.count <= ?
      RETURNING count
    `).bind(key, action, ipHash, bucketStart, now, maxCount).first<{count: number}>()
    // Once the first blocked request raises the stored count to maxCount + 1,
    // later blocked requests skip the UPDATE and therefore stop consuming D1
    // rows-written. The effective count remains blocked for this window.
    return row?.count ?? (maxCount + 1)
  }

  async purgeAbuseCounters(before: string, limit: number = 1000): Promise<number> {
    const result = await this.db.prepare(`
      DELETE FROM abuse_counters
      WHERE rowid IN (
        SELECT rowid FROM abuse_counters
        WHERE updated_at < ?
        ORDER BY updated_at ASC
        LIMIT ?
      )
    `).bind(before, boundedPurgeLimit(limit)).run()
    return result.meta.changes || 0
  }

  async createAuditLog(log: AuditLog): Promise<void> {
    await this.db.prepare(`
      INSERT INTO audit_logs (
        id, action, share_id, subject_type, subject_name, size_bytes,
        ip_hash, user_agent_hash, status, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      log.id,
      log.action,
      log.share_id,
      log.subject_type,
      log.subject_name,
      log.size_bytes,
      log.ip_hash,
      log.user_agent_hash,
      log.status,
      log.created_at,
    ).run()
  }

  async getAuditLogs(limit: number, offset: number): Promise<{ items: AuditLogDetails[], total: number }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100)
    const safeOffset = Math.max(offset, 0)
    const total = await this.db.prepare('SELECT count(*) as c FROM audit_logs').first<{ c: number }>()
    const { results } = await this.db.prepare(`
      SELECT
        audit.id,
        audit.action,
        audit.share_id,
        COALESCE(
          audit.subject_type,
          shares.type,
          CASE WHEN uploads.id IS NOT NULL THEN 'file' END
        ) AS subject_type,
        audit.ip_hash,
        audit.status,
        audit.created_at,
        COALESCE(audit.subject_name, shares.display_name, uploads.display_name) AS subject_name,
        COALESCE(audit.size_bytes, shares.size_bytes, uploads.size_bytes) AS size_bytes
      FROM audit_logs AS audit
      LEFT JOIN shares ON shares.id = audit.share_id
      LEFT JOIN upload_sessions AS uploads ON uploads.share_id = audit.share_id
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT ? OFFSET ?
    `)
      .bind(safeLimit, safeOffset)
      .all<AuditLogDetails>()
    return { items: results, total: total?.c || 0 }
  }

  async getAuditStats(): Promise<AuditStats> {
    const stats = await this.db.prepare(`
      SELECT
        count(*) AS total,
        sum(CASE
          WHEN status = 'success'
            AND action IN ('share_text_create', 'multipart_file_complete')
          THEN 1 ELSE 0
        END) AS completed_shares,
        sum(CASE
          WHEN status = 'success'
            AND action IN ('share_resolve_text', 'share_download_file')
          THEN 1 ELSE 0
        END) AS completed_retrievals,
        count(DISTINCT CASE
          WHEN created_at >= ?
            AND ip_hash IS NOT NULL
            AND action NOT LIKE 'admin_%'
          THEN ip_hash
        END) AS active_sources
      FROM audit_logs
    `)
      .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .first<{
        total: number | null
        completed_shares: number | null
        completed_retrievals: number | null
        active_sources: number | null
      }>()
    return {
      total: Number(stats?.total || 0),
      completedShares: Number(stats?.completed_shares || 0),
      completedRetrievals: Number(stats?.completed_retrievals || 0),
      activeSources: Number(stats?.active_sources || 0),
    }
  }

  async purgeAuditLogs(before: string, limit: number = 1000): Promise<number> {
    const result = await this.db.prepare(`
      DELETE FROM audit_logs
      WHERE rowid IN (
        SELECT rowid FROM audit_logs
        WHERE created_at < ?
        ORDER BY created_at ASC
        LIMIT ?
      )
    `).bind(before, boundedPurgeLimit(limit)).run()
    return result.meta.changes || 0
  }

  async purgeDeletedShares(before: string, limit: number = 1000): Promise<number> {
    const result = await this.db.prepare(`
      DELETE FROM shares
      WHERE rowid IN (
        SELECT rowid FROM shares
        WHERE deleted_at IS NOT NULL AND deleted_at < ?
        ORDER BY deleted_at ASC
        LIMIT ?
      )
    `).bind(before, boundedPurgeLimit(limit)).run()
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

function boundedPurgeLimit(limit: number): number {
  const normalized = Number.isFinite(limit) ? Math.trunc(limit) : 1000
  return Math.min(Math.max(normalized, 1), 1000)
}
