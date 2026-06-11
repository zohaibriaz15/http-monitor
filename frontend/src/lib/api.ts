import { API_BASE } from './config';
import type { AnalysisResponse, MonitorResult, ResultsPage, Stats } from './types';

// Thin REST client. Throws an Error with the backend's message (it returns
// `{ error: { message, status } }`) so React Query surfaces something useful.
async function getJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(body?.error?.message || `Request failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function fetchResults({ limit = 50, offset = 0 } = {}): Promise<ResultsPage> {
  return getJson<ResultsPage>(`/api/results?limit=${limit}&offset=${offset}`);
}

export function fetchStats(): Promise<Stats> {
  return getJson<Stats>('/api/stats');
}

export function fetchAnalysis(): Promise<AnalysisResponse> {
  return getJson<AnalysisResponse>('/api/analysis');
}

// Manually trigger a monitor cycle. The resulting record also arrives over the
// WebSocket, so the UI updates from that push; we still return it for callers.
export function triggerRun(): Promise<MonitorResult> {
  return getJson<MonitorResult>('/api/monitor/run', { method: 'POST' });
}
