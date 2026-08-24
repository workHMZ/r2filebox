import type { UploadCleanupJob, UploadSession } from '../types'
import { DB } from './db'
import { R2Storage } from './r2'

export interface UploadCleanupOutcome {
  aborted: boolean
  deletedObject: boolean
}

/**
 * Atomically moves one upload reservation to the cleanup outbox before any R2
 * mutation. Completion and cleanup both require the session row, so D1 decides
 * which side owns the final object before either side can commit metadata.
 */
export async function claimAndReconcileUploadSession(
  r2: R2Storage,
  db: DB,
  session: UploadSession,
): Promise<boolean> {
  const claim = await db.claimUploadSessionsForCleanup([session], new Date().toISOString())
  let job = claim.jobs.find((candidate) => candidate.id === session.id) || null
  if (!job) job = await db.getUploadCleanupJob(session.id)

  if (!job) {
    if (claim.removedSessionIds.includes(session.id)) {
      // A completed share already accounts for this object; only the stale
      // duplicate reservation was removed.
      return true
    }
    const currentSession = await db.getUploadSession(session.id)
    return currentSession === null
  }

  await reconcileAndReleaseUploadCleanupJob(r2, db, job)
  return true
}

export async function reconcileClaimedUploadCleanupJob(
  r2: R2Storage,
  db: DB,
  id: string,
): Promise<boolean> {
  const job = await db.getUploadCleanupJob(id)
  if (!job) return true
  await reconcileAndReleaseUploadCleanupJob(r2, db, job)
  return true
}

async function reconcileAndReleaseUploadCleanupJob(
  r2: R2Storage,
  db: DB,
  job: UploadCleanupJob,
): Promise<void> {
  await reconcileUploadCleanupJob(r2, job)
  const removed = await db.deleteUploadCleanupJobsByIds([job.id])
  if (!removed && await db.getUploadCleanupJob(job.id)) {
    throw new Error(`Reconciled upload cleanup job ${job.id} was retained`)
  }
}

/**
 * Reconciles one outbox-owned upload. The outbox claim guarantees that no
 * completion transaction can subsequently publish this session's R2 key.
 */
export async function reconcileUploadCleanupJob(
  r2: R2Storage,
  job: UploadCleanupJob,
): Promise<UploadCleanupOutcome> {
  const completedBeforeAbort = await r2.headObject(job.r2_key)
  if (completedBeforeAbort) {
    await r2.deleteObject(job.r2_key)
    return { aborted: false, deletedObject: true }
  }

  const multipart = r2.resumeMultipartUpload(job.r2_key, job.upload_id)
  try {
    await multipart.abort()
  } catch (abortError) {
    // An earlier attempt may have reconciled R2 but failed to delete the D1
    // outbox row. R2 reports that idempotent retry as NoSuchUpload (10024).
    // R2 object reads are strongly consistent, so a second empty HEAD confirms
    // that neither a completed final object nor this multipart upload remains.
    const completedAfterFailedAbort = await r2.headObject(job.r2_key)
    if (completedAfterFailedAbort) {
      await r2.deleteObject(job.r2_key)
      return { aborted: false, deletedObject: true }
    }
    if (!isMissingMultipartUploadError(abortError)) throw abortError
    return { aborted: false, deletedObject: false }
  }

  // R2 may report abort success after a racing complete produced the final
  // object. The post-abort HEAD prevents that object from escaping cleanup.
  const completedAfterAbort = await r2.headObject(job.r2_key)
  if (completedAfterAbort) {
    await r2.deleteObject(job.r2_key)
    return { aborted: false, deletedObject: true }
  }
  return { aborted: true, deletedObject: false }
}

export function isMissingMultipartUploadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown }
  if (candidate.code === 10024 || candidate.code === '10024') return true
  if (candidate.name === 'NoSuchUpload') return true
  return typeof candidate.message === 'string' &&
    /(?:NoSuchUpload|multipart upload (?:does not exist|not found)|specified upload does not exist)/i
      .test(candidate.message)
}
