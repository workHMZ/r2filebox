export interface MetricDataPoint {
  event: string
  status?: 'success' | 'failed'
  subjectType?: string
  mimeType?: string
  sizeBytes?: number
  durationMs?: number
}

interface MetricsEnv {
  ANALYTICS?: AnalyticsEngineDataset
}

/**
 * Safely log a metric data point to Cloudflare Workers Analytics Engine.
 * writeDataPoint is synchronous, so this adds no asynchronous wait; binding
 * errors are caught and logged without failing the user request.
 */
export function recordMetric(env: MetricsEnv, data: MetricDataPoint): void {
  if (!env.ANALYTICS) return

  try {
    const blobs: string[] = [
      data.event,
      data.status || 'success',
      data.subjectType || 'unknown',
      data.mimeType || 'none',
    ]

    const doubles: number[] = [
      Number.isFinite(data.sizeBytes) ? (data.sizeBytes as number) : 0,
      Number.isFinite(data.durationMs) ? (data.durationMs as number) : 0,
    ]

    env.ANALYTICS.writeDataPoint({
      blobs,
      doubles,
      indexes: [data.event],
    })
  } catch (error) {
    console.error('Failed to write Analytics Engine metric:', error)
  }
}
