import { DB } from './db'
import { R2Storage } from './r2'

export async function cleanupExpiredShares(
  db: D1Database, 
  bucket: R2Bucket, 
  batchSize: number = 100
): Promise<{
  processed: number
  deletedR2: number
  abortedUploads: number
  purgedCounters: number
  purgedAuditLogs: number
  purgedShares: number
  failures: number
}> {
  const dbClient = new DB(db)
  const r2Client = new R2Storage(bucket)
  
  const expiredShares = await dbClient.getExpiredShares(batchSize)
  const uploadSessionStaleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const expiredUploadSessions = await dbClient.getExpiredUploadSessions(batchSize, uploadSessionStaleBefore)
  
  let processed = 0
  let deletedR2 = 0
  let abortedUploads = 0
  let failures = 0
  
  for (const share of expiredShares) {
    try {
      await r2Client.deleteObject(share.r2_key)
      deletedR2++
	      
      // 2. Mark as deleted in DB
      await dbClient.deleteShareById(share.id)
      processed++
      
    } catch (e) {
      failures++
      console.error(`Failed to cleanup share ${share.id}:`, e)
      // Continue with others even if one fails
    }
  }

  for (const session of expiredUploadSessions) {
    try {
      const multipart = r2Client.resumeMultipartUpload(session.r2_key, session.upload_id)
      await multipart.abort()
      abortedUploads++
    } catch (e) {
      failures++
      console.error(`Failed to cleanup upload session ${session.id}:`, e)
    }
    try {
      await dbClient.deleteUploadSession(session.id)
    } catch (e) {
      failures++
      console.error(`Failed to delete upload session ${session.id}:`, e)
    }
  }

  const [purgedCounters, purgedAuditLogs, purgedShares] = await Promise.all([
    dbClient.purgeAbuseCounters(new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()),
    dbClient.purgeAuditLogs(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    dbClient.purgeDeletedShares(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ])
  
  return { processed, deletedR2, abortedUploads, purgedCounters, purgedAuditLogs, purgedShares, failures }
}
