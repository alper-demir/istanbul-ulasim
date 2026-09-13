export type SourceFailureKind = 'timeout' | 'http' | 'response' | 'rate-limit' | 'network' | 'unknown';
export type SourceOperationalStatus = 'unknown' | 'operational' | 'unavailable';

export type SourceRuntimeMetrics = {
  cacheHits: number;
  staleResponses: number;
  upstreamRequests: number;
  upstreamFailures: number;
  upstreamTimeouts: number;
  responseDurationMsTotal: number;
  responseDurationSamples: number;
  lastUpstreamRequestAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureKind: SourceFailureKind | null;
};

export type RuntimeSourceHealth = {
  operationalStatus: SourceOperationalStatus;
  lastUpstreamRequestAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureKind: SourceFailureKind | null;
  averageResponseDurationMs: number | null;
};

export function classifySourceFailure(error: unknown): SourceFailureKind {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
  const message = error instanceof Error ? error.message.toLocaleLowerCase('tr-TR') : '';
  if (message.includes('zaman aşım')) return 'timeout';
  if (message.includes('429') || message.includes('istek bütçesi')) return 'rate-limit';
  if (/\b[45]\d{2}\b/u.test(message)) return 'http';
  if (message.includes('yanıt') || message.includes('liste biçiminde') || message.includes('beklenen alan')) return 'response';
  if (message.includes('fetch') || message.includes('network') || message.includes('ağ')) return 'network';
  return 'unknown';
}

function timestamp(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sourceOperationalStatus(metrics: SourceRuntimeMetrics): SourceOperationalStatus {
  if (!metrics.upstreamRequests) return 'unknown';
  if (timestamp(metrics.lastFailureAt) > timestamp(metrics.lastSuccessAt)) return 'unavailable';
  return 'operational';
}

export function averageResponseDurationMs(metrics: SourceRuntimeMetrics) {
  if (!metrics.responseDurationSamples) return null;
  return Math.round(metrics.responseDurationMsTotal / metrics.responseDurationSamples);
}

export function runtimeSourceHealth(metrics: SourceRuntimeMetrics): RuntimeSourceHealth {
  return {
    operationalStatus: sourceOperationalStatus(metrics),
    lastUpstreamRequestAt: metrics.lastUpstreamRequestAt,
    lastSuccessAt: metrics.lastSuccessAt,
    lastFailureAt: metrics.lastFailureAt,
    lastFailureKind: metrics.lastFailureKind,
    averageResponseDurationMs: averageResponseDurationMs(metrics),
  };
}
