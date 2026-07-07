import { DB } from './db'
import { R2Storage } from './r2'

export async function cleanupExpiredShares(
  db: D1Database, 
  bucket: R2Bucket, 
  batchSize: number = 100
): Promise<{ processed: number, deletedR2: number, abortedUploads: number }> {
  const dbClient = new DB(db)
  const r2Client = new R2Storage(bucket)
  
  const expiredShares = await dbClient.getExpiredShares(batchSize)
  const uploadSessionStaleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const expiredUploadSessions = await dbClient.getExpiredUploadSessions(batchSize, uploadSessionStaleBefore)
  
  let processed = 0
  let deletedR2 = 0
  let abortedUploads = 0
  
  for (const share of expiredShares) {
    try {
      await r2Client.deleteObject(share.r2_key)
      deletedR2++
	      
      // 2. Mark as deleted in DB
      await dbClient.deleteShareById(share.id)
      processed++
      
    } catch (e) {
      console.error(`Failed to cleanup share ${share.id}:`, e)
      // Continue with others even if one fails
    }
  }

  for (const session of expiredUploadSessions) {
    try {
      const multipart = r2Client.resumeMultipartUpload(session.r2_key, session.upload_id)
      await multipart.abort()
      await dbClient.deleteUploadSession(session.id)
      abortedUploads++
    } catch (e) {
      console.error(`Failed to cleanup upload session ${session.id}:`, e)
    }
  }
  
  return { processed, deletedR2, abortedUploads }
}
