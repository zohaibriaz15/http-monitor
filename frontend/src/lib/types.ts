// Shapes mirror the backend's API responses (see backend monitorRepository.mapRow).

export interface MonitorResult {
  id: number;
  targetUrl: string;
  requestPayload: Record<string, unknown>;
  success: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  responseBody: unknown;
  errorMessage: string | null;
  requestedAt: string;
  createdAt: string;
}

export interface ResultsPage {
  items: MonitorResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface Stats {
  total: number;
  successes: number;
  failures: number;
  avgResponseTimeMs: number | null;
  lastRequestedAt: string | null;
}

// ── Anomaly analysis (mirrors backend anomalyDetector / analysisService) ──

export type AnomalyReason =
  | 'request_failed'
  | 'latency_spike'
  | 'latency_drop'
  | 'prediction_error';

export interface AnalysisPoint {
  id: number;
  requestedAt: string;
  responseTimeMs: number | null;
  success: boolean;
  statusCode: number | null;
  rollingMean: number | null;
  rollingStd: number | null;
  upperBand: number | null;
  lowerBand: number | null;
  predicted: number | null;
  zScore: number | null;
  predictionError: number | null;
  isAnomaly: boolean;
  reasons: AnomalyReason[];
  warmingUp: boolean;
}

export interface AnalysisAlert {
  id: number;
  requestedAt: string;
  responseTimeMs: number | null;
  reasons: AnomalyReason[];
  zScore: number | null;
}

export interface AnalysisSummary {
  sampleCount: number;
  totalPoints: number;
  currentMean: number | null;
  currentStd: number | null;
  nextPredictedMs: number | null;
  upperBand: number | null;
  lowerBand: number | null;
  lastZScore: number | null;
  anomalyCount: number;
  warmingUp: boolean;
  alerts: AnalysisAlert[];
}

export interface AnalysisResponse {
  window: { ms: number; hours: number };
  config: { zThreshold: number; ewmaAlpha: number; minSamples: number };
  points: AnalysisPoint[];
  summary: AnalysisSummary;
}

// Frames pushed over the WebSocket by the backend broadcaster. A monitor_result
// carries the full record plus that point's anomaly verdict (`analysis`) and the
// refreshed analysis `summary`.
export type WsMessage =
  | { type: 'connected'; data: { at: string } }
  | {
      type: 'monitor_result';
      data: MonitorResult & { analysis?: AnalysisPoint | null };
      summary?: AnalysisSummary;
    };

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting';
