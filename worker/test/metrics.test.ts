import { describe, expect, it, vi } from 'vitest'
import { recordMetric } from '../src/lib/metrics'

describe('Analytics Engine metrics', () => {
  it('safely calls writeDataPoint on env.ANALYTICS when available', () => {
    const writeDataPoint = vi.fn()
    const env = {
      ANALYTICS: { writeDataPoint },
    }

    recordMetric(env, {
      event: 'download_file',
      status: 'success',
      subjectType: 'file',
      mimeType: 'video/mp4',
      sizeBytes: 1048576,
    })

    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: ['download_file', 'success', 'file', 'video/mp4'],
      doubles: [1048576, 0],
      indexes: ['download_file'],
    })
  })

  it('handles missing ANALYTICS binding gracefully without throwing', () => {
    const env = {}
    expect(() => {
      recordMetric(env, { event: 'test_event' })
    }).not.toThrow()
  })
})
