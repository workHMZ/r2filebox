import { env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DB } from '../src/lib/db'

const DAY_MS = 24 * 60 * 60 * 1000
const TOKYO_OFFSET_MINUTES = 9 * 60

describe('administrator upload trend', () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL, r2_key TEXT NOT NULL, display_name TEXT,
        mime_type TEXT, size_bytes INTEGER NOT NULL, title TEXT,
        created_at TEXT NOT NULL, expire_at TEXT NOT NULL, deleted_at TEXT,
        max_downloads INTEGER, download_count INTEGER NOT NULL,
        created_ip_hash TEXT, last_access_at TEXT, object_etag TEXT,
        object_uploaded_at TEXT, blob_id TEXT
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_usage (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_bytes INTEGER NOT NULL DEFAULT 0
      )`),
    ])
  })

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM shares').run()
  })

  it('excludes exhausted shares from active counts and scopes pickups to retained shares', async () => {
    for (const id of ['active', 'exhausted', 'unlimited', 'expired', 'deleted']) {
      await insertShare(id, new Date(), id === 'deleted' ? new Date() : null)
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE shares SET download_count = 10 WHERE id IN ('exhausted', 'deleted')"),
      env.DB.prepare("UPDATE shares SET max_downloads = NULL, download_count = 20 WHERE id = 'unlimited'"),
      env.DB.prepare("UPDATE shares SET expire_at = ? WHERE id = 'expired'").bind(new Date(Date.now() - 1000).toISOString()),
    ])
    const stats = await new DB(env.DB).getSystemStats(TOKYO_OFFSET_MINUTES)
    expect(stats.active_shares).toBe(2)
    expect(stats.total_downloads).toBe(30)
    expect(stats.total_shares).toBe(4)
  })

  it('buckets by the viewer calendar, fills quiet days, and keeps cleaned-up uploads', async () => {
    const offsetMs = TOKYO_OFFSET_MINUTES * 60 * 1000
    const todayStartUtc = (Math.floor((Date.now() + offsetMs) / DAY_MS) * DAY_MS) - offsetMs
    const localDate = (utcMs: number) => new Date(utcMs + offsetMs).toISOString().slice(0, 10)

    // 00:30 in Tokyo is still the previous day in UTC.
    await insertShare('early-today', new Date(todayStartUtc + (30 * 60 * 1000)), null)
    await insertShare('expired-today', new Date(todayStartUtc + (40 * 60 * 1000)), new Date())
    await insertShare('late-yesterday', new Date(todayStartUtc - (30 * 60 * 1000)), null)

    const trend = await new DB(env.DB).getUploadTrend(7, TOKYO_OFFSET_MINUTES)
    expect(trend).toHaveLength(7)
    expect(trend.map((point) => point.date)).toEqual(
      Array.from({ length: 7 }, (_, index) => localDate(todayStartUtc - ((6 - index) * DAY_MS))),
    )
    expect(trend.map((point) => point.uploads)).toEqual([0, 0, 0, 0, 0, 1, 2])

    const stats = await new DB(env.DB).getSystemStats(TOKYO_OFFSET_MINUTES)
    expect(stats.today_uploads).toBe(2)
    // Live figures still leave the cleaned-up share out.
    expect(stats.total_shares).toBe(2)
  })
})

async function insertShare(id: string, createdAt: Date, deletedAt: Date | null): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO shares (
      id, code_hash, type, r2_key, display_name, mime_type, size_bytes, title,
      created_at, expire_at, deleted_at, max_downloads, download_count,
      created_ip_hash, last_access_at, object_etag, object_uploaded_at, blob_id
    ) VALUES (?, ?, 'text', ?, 'text.txt', 'text/plain', 1, NULL, ?, ?, ?, 10, 0, NULL, NULL, NULL, NULL, NULL)
  `).bind(
    id,
    `hash-${id}`,
    `objects/${id}`,
    createdAt.toISOString(),
    new Date(Date.now() + DAY_MS).toISOString(),
    deletedAt?.toISOString() ?? null,
  ).run()
}
