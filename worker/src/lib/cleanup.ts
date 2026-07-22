import { DB } from './db'
import { R2Storage } from './r2'

const HISTORY_PURGE_BATCH_SIZE = 1000

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

  if (expiredShares.length) {
    const r2Keys = [...new Set(expiredShares.map((share) => share.r2_key))]
    try {
      // R2 accepts up to 1,000 keys per delete. The configured cleanup batch is
      // capped at 100, so this remains one binding operation.
      await r2Client.deleteObjects(r2Keys)
      deletedR2 += r2Keys.length
      processed = await dbClient.markSharesDeletedByIds(
        expiredShares.map((share) => share.id),
        new Date().toISOString(),
      )
    } catch (e) {
      failures += expiredShares.length
      console.error('Failed to batch cleanup expired shares:', e)
    }
  }

  const cleanedSessionIds: string[] = []
  const activeShareKeys = new Map((await dbClient.getActiveShareKeys(
    expiredUploadSessions.map((session) => session.share_id),
  )).map((share) => [share.id, share.r2_key]))
  // Older versions inserted the active share before deleting its upload
  // reservation. Repair those rows without touching the completed R2 object.
  for (const session of expiredUploadSessions) {
    if (activeShareKeys.get(session.share_id) === session.r2_key) {
      cleanedSessionIds.push(session.id)
    }
  }
  const sessionsToAbort = expiredUploadSessions.filter(
    (session) => activeShareKeys.get(session.share_id) !== session.r2_key,
  )
  // Keep binding concurrency conservative while avoiding one D1 DELETE per session.
  for (let offset = 0; offset < sessionsToAbort.length; offset += 6) {
    // Six avoids starting a large burst of R2 binding operations at once.
    const chunk = sessionsToAbort.slice(offset, offset + 6)
    const results = await Promise.all(chunk.map(async (session) => {
      try {
        const multipart = r2Client.resumeMultipartUpload(session.r2_key, session.upload_id)
        await multipart.abort()
        return { id: session.id, aborted: true, deletedObject: false }
      } catch (abortError) {
        // A completed multipart upload cannot be aborted. Deleting its final key
        // also makes a lost R2-complete/D1-commit window safe to clean up. If
        // the upload is still incomplete, R2 automatically expires it after
        // seven days by default even though deleting the final key is a no-op.
        try {
          await r2Client.deleteObject(session.r2_key)
          return { id: session.id, aborted: false, deletedObject: true }
        } catch (deleteError) {
          console.error(`Failed to cleanup upload session ${session.id}:`, {
            abortError,
            deleteError,
          })
          return null
        }
      }
    }))
    for (const result of results) {
      if (!result) {
        failures++
        continue
      }
      cleanedSessionIds.push(result.id)
      if (result.aborted) abortedUploads++
      if (result.deletedObject) deletedR2++
    }
  }

  if (cleanedSessionIds.length) {
    try {
      await dbClient.deleteUploadSessionsByIds(cleanedSessionIds)
    } catch (e) {
      failures += cleanedSessionIds.length
      console.error('Failed to batch delete stale upload sessions:', e)
    }
  }

  const purgeResults = await Promise.allSettled([
    dbClient.purgeAbuseCounters(
      new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      HISTORY_PURGE_BATCH_SIZE,
    ),
    dbClient.purgeAuditLogs(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      HISTORY_PURGE_BATCH_SIZE,
    ),
    dbClient.purgeDeletedShares(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      HISTORY_PURGE_BATCH_SIZE,
    ),
  ])
  const [purgedCounters, purgedAuditLogs, purgedShares] = purgeResults.map((result) => {
    if (result.status === 'fulfilled') return result.value
    failures++
    console.error('Failed to purge cleanup history:', result.reason)
    return 0
  })

  return { processed, deletedR2, abortedUploads, purgedCounters, purgedAuditLogs, purgedShares, failures }
}
