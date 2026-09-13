import { describe, expect, it } from 'vitest';
import { averageResponseDurationMs, classifySourceFailure, runtimeSourceHealth, sourceOperationalStatus, type SourceRuntimeMetrics } from '@/lib/source-observability';

function metrics(overrides: Partial<SourceRuntimeMetrics> = {}): SourceRuntimeMetrics {
  return {
    cacheHits: 0,
    staleResponses: 0,
    upstreamRequests: 0,
    upstreamFailures: 0,
    upstreamTimeouts: 0,
    responseDurationMsTotal: 0,
    responseDurationSamples: 0,
    lastUpstreamRequestAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureKind: null,
    ...overrides,
  };
}

describe('source observability', () => {
  it('keeps an untouched source unknown instead of claiming it is healthy', () => {
    expect(sourceOperationalStatus(metrics())).toBe('unknown');
  });

  it('marks a source unavailable only while its newest outcome is a failure', () => {
    const failed = metrics({ upstreamRequests: 3, lastSuccessAt: '2026-09-13T09:00:00.000Z', lastFailureAt: '2026-09-13T09:01:00.000Z' });
    expect(sourceOperationalStatus(failed)).toBe('unavailable');
    expect(sourceOperationalStatus({ ...failed, lastSuccessAt: '2026-09-13T09:02:00.000Z' })).toBe('operational');
  });

  it('returns compact failure classes and latency summaries without raw error text', () => {
    expect(classifySourceFailure(new Error('İETT canlı araç isteği zaman aşımına uğradı'))).toBe('timeout');
    expect(classifySourceFailure(new Error('İETT canlı araç servisi 503 döndürdü'))).toBe('http');
    expect(averageResponseDurationMs(metrics({ responseDurationMsTotal: 251, responseDurationSamples: 2 }))).toBe(126);
    expect(runtimeSourceHealth(metrics({ upstreamRequests: 1, lastSuccessAt: '2026-09-13T09:02:00.000Z' }))).toMatchObject({ operationalStatus: 'operational', averageResponseDurationMs: null });
  });
});
