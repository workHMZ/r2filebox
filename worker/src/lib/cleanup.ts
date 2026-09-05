import { DB } from './db'
import { R2Storage } from './r2'
import { reconcileUploadCleanupJob } from './upload-cleanup'

const HISTORY_PURGE_BATCH_SIZE = 1000

// Draining repeats a pass while a batch came back full *and* that same batch
// made forward progress, so a backlog larger than one batch is not deferred to
// the next trigger while a permanently failing row still cannot spin the loop.
//
// The pass count is the CPU control, and it is deliberately small. The Workers
// Free plan allows 10 ms of CPU per invocation (Cron Triggers included); time
// spent awaiting D1 and R2 does not count, but parsing batches of rows and
// serialising id lists does. Invocations are the cheap axis here - an idle run
// costs 11 rows read and 0 rows written - so throughput comes from the hourly
// schedule rather than from doing more work inside one invocation. A paid
// deployment (30 s / 15 min of CPU) can raise this safely.
const DEFAULT_MAX_CLEANUP_PASSES = 3

// Wall-clock backstop only, for the case where R2 turns pathologically slow.
// It is not what keeps the run inside the CPU limit; the pass count is.
const DEFAULT_CLEANUP_BUDGET_MS = 10_000

export interface CleanupResult {
  processed: number
  deletedR2: number
  abortedUploads: number
  purgedCounters: number
  purgedAuditLogs: number
  purgedShares: number
  failures: number
}

export interface CleanupOptions {
  /**
   * Upper bound on repeated passes within one invocation. Keep this small on
   * the Workers Free plan: 10 ms of CPU per invocation is the binding limit.
   */
  maxPasses?: number
  /** Wall-clock backstop; checked between passes, never mid-pass. */
  budgetMs?: number
}

interface CleanupPassResult extends CleanupResult {
  /** True when a batch was returned full and that batch also made progress. */
  moreWorkLikely: boolean
}

export async function cleanupExpiredShares(
  db: D1Database,
  bucket: R2Bucket,
  batchSize: number = 100,
  options: CleanupOptions = {},
): Promise<CleanupResult> {
  const dbClient = new DB(db)
  const r2Client = new R2Storage(bucket)
  const maxPasses = Math.max(1, Math.trunc(options.maxPasses ?? DEFAULT_MAX_CLEANUP_PASSES))
  const budgetMs = Math.max(0, options.budgetMs ?? DEFAULT_CLEANUP_BUDGET_MS)
  const deadline = Date.now() + budgetMs

  const totals: CleanupResult = {
    processed: 0,
    deletedR2: 0,
    abortedUploads: 0,
    purgedCounters: 0,
    purgedAuditLogs: 0,
    purgedShares: 0,
    failures: 0,
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    const result = await runCleanupPass(dbClient, r2Client, batchSize)
    totals.processed += result.processed
    totals.deletedR2 += result.deletedR2
    totals.abortedUploads += result.abortedUploads
    totals.purgedCounters += result.purgedCounters
    totals.purgedAuditLogs += result.purgedAuditLogs
    totals.purgedShares += result.purgedShares
    totals.failures += result.failures
    if (!result.moreWorkLikely) break
    if (Date.now() >= deadline) break
  }

  return totals
}

async function runCleanupPass(
  dbClient: DB,
  r2Client: R2Storage,
  batchSize: number,
): Promise<CleanupPassResult> {
  // Mirror the clamping each DB helper applies so that "batch came back full"
  // compares against the limit the query actually used.
  const shareLimit = clamp(batchSize, 1, 100)
  const outboxLimit = clamp(Math.trunc(batchSize), 1, 1000)

  const expiredShares = await dbClient.getExpiredShares(batchSize)
  const uploadSessionStaleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const expiredUploadSessions = await dbClient.getExpiredUploadSessions(batchSize, uploadSessionStaleBefore)
  // Claim stale sessions in D1 before touching either shares or R2. A D1 batch
  // atomically moves unreferenced sessions to a durable cleanup outbox and
  // removes duplicate reservations whose final object already has an active
  // share. Completion also requires the session row, so only one side can win.
  const claim = await dbClient.claimUploadSessionsForCleanup(
    expiredUploadSessions,
    new Date().toISOString(),
  )

  let processed = 0
  let deletedR2 = 0
  let abortedUploads = 0
  let failures = 0

  if (expiredShares.length) {
    const managedFileShares = expiredShares.filter(
      (share) => share.type === 'file' && Boolean(share.blob_id),
    )
    const directObjectShares = expiredShares.filter(
      (share) => share.type !== 'file' || !share.blob_id,
    )
    const deletedAt = new Date().toISOString()

    if (directObjectShares.length) {
      const r2Keys = [...new Set(directObjectShares.map((share) => share.r2_key))]
      try {
        // Legacy file rows and text shares still own their R2 keys directly.
        // Preserve the established delete-first ordering for those objects.
        await r2Client.deleteObjects(r2Keys)
        deletedR2 += r2Keys.length
        processed += await dbClient.markSharesDeletedByIds(
          directObjectShares.map((share) => share.id),
          deletedAt,
        )
      } catch (e) {
        failures += directObjectShares.length
        console.error('Failed to batch cleanup expired direct-object shares:', e)
      }
    }

    if (managedFileShares.length) {
      try {
        // Managed file shares may share one physical R2 object. Soft-delete the
        // logical shares first; the migration trigger moves only an unreferenced
        // blob to the durable orphan outbox.
        processed += await dbClient.markSharesDeletedByIds(
          managedFileShares.map((share) => share.id),
          deletedAt,
        )
        await dbClient.orphanUnreferencedFileBlobs(
          managedFileShares.flatMap((share) => share.blob_id ? [share.blob_id] : []),
          deletedAt,
        )
      } catch (e) {
        failures += managedFileShares.length
        console.error('Failed to mark expired managed file shares:', e)
      }
    }
  }

  // Retry both newly orphaned blobs and outbox rows left by an earlier R2 or
  // D1 failure. R2 deletion is idempotent; remove the accounting row only after
  // the object deletion succeeds.
  const orphanedBlobs = await dbClient.getOrphanedFileBlobs(batchSize)
  let deletedBlobs = 0
  for (let offset = 0; offset < orphanedBlobs.length; offset += 6) {
    const chunk = orphanedBlobs.slice(offset, offset + 6)
    const results = await Promise.all(chunk.map(async (blob) => {
      try {
        await r2Client.deleteObject(blob.r2_key)
        const removed = await dbClient.deleteOrphanedFileBlob(blob.id)
        if (!removed) {
          const remaining = await dbClient.getFileBlobById(blob.id)
          if (remaining) {
            throw new Error('Orphaned blob row was retained after R2 deletion')
          }
        }
        return true
      } catch (error) {
        console.error(`Failed to cleanup orphaned file blob ${blob.id}:`, error)
        return false
      }
    }))
    for (const removed of results) {
      if (removed) {
        deletedR2++
        deletedBlobs++
      } else {
        failures++
      }
    }
  }

  const cleanupJobs = await dbClient.getUploadCleanupJobs(batchSize)
  const activeJobR2Keys = new Set(await dbClient.getActiveR2Keys(
    cleanupJobs.map((job) => job.r2_key),
  ))
  const cleanedJobIds = cleanupJobs
    .filter((job) => activeJobR2Keys.has(job.r2_key))
    .map((job) => job.id)
  const jobsToReconcile = cleanupJobs.filter((job) => !activeJobR2Keys.has(job.r2_key))
  // The active-reference check is defensive for data written by an overlapping
  // old isolate or manual repair. Normal 2.5 completion cannot publish after
  // the atomic claim has removed the session row.
  for (let offset = 0; offset < jobsToReconcile.length; offset += 6) {
    // Six avoids starting a large burst of R2 binding operations at once.
    const chunk = jobsToReconcile.slice(offset, offset + 6)
    const results = await Promise.all(chunk.map(async (job) => {
      try {
        return { id: job.id, ...await reconcileUploadCleanupJob(r2Client, job) }
      } catch (cleanupError) {
        // Keep the outbox reservation when R2 cannot be reconciled. Removing it
        // here could leave multipart parts or a completed object unaccounted.
        console.error(`Failed to cleanup upload job ${job.id}:`, cleanupError)
        return null
      }
    }))
    for (const result of results) {
      if (!result) {
        failures++
        continue
      }
      cleanedJobIds.push(result.id)
      if (result.aborted) abortedUploads++
      if (result.deletedObject) deletedR2++
    }
  }

  let removedJobs = 0
  if (cleanedJobIds.length) {
    try {
      removedJobs = await dbClient.deleteUploadCleanupJobsByIds(cleanedJobIds)
    } catch (e) {
      failures += cleanedJobIds.length
      console.error('Failed to batch delete reconciled upload cleanup jobs:', e)
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

  // Each clause pairs "the batch was full" with "this batch actually shrank the
  // backlog". A batch that only produced failures therefore stops the drain
  // instead of being retried until the pass or time budget runs out.
  const moreWorkLikely =
    (expiredShares.length >= shareLimit && processed > 0) ||
    (expiredUploadSessions.length >= shareLimit && claim.removedSessionIds.length > 0) ||
    (orphanedBlobs.length >= outboxLimit && deletedBlobs > 0) ||
    (cleanupJobs.length >= outboxLimit && removedJobs > 0) ||
    purgedCounters >= HISTORY_PURGE_BATCH_SIZE ||
    purgedAuditLogs >= HISTORY_PURGE_BATCH_SIZE ||
    purgedShares >= HISTORY_PURGE_BATCH_SIZE

  return {
    processed,
    deletedR2,
    abortedUploads,
    purgedCounters,
    purgedAuditLogs,
    purgedShares,
    failures,
    moreWorkLikely,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
