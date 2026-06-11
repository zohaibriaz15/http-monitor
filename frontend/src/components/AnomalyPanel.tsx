import type { AnalysisResponse, AnomalyReason } from '../lib/types';

const REASON_LABELS: Record<AnomalyReason, string> = {
  request_failed: 'Request failed',
  latency_spike: 'Latency spike',
  latency_drop: 'Latency drop',
  prediction_error: 'Forecast deviation',
};

function ms(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)} ms`;
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
      <div className={`text-xl font-semibold tabular-nums ${accent ? 'text-amber-400' : 'text-slate-100'}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

export default function AnomalyPanel({ analysis }: { analysis: AnalysisResponse | null }) {
  if (!analysis) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5 text-slate-400">
        Loading anomaly analysis…
      </div>
    );
  }

  const { summary, config, window } = analysis;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">

      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Anomaly Detection
          </h2>
          <span className="text-xs text-slate-500">
            z-score · {window.hours}h window · ±{config.zThreshold}σ · EWMA α={config.ewmaAlpha}
          </span>
        </div>
        {summary.warmingUp && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-300">
            warming up
          </span>
        )}
      </div>

      {/* Stats tiles — 4 in a row */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Rolling mean"   value={ms(summary.currentMean)} />
        <Tile label="Std deviation"  value={ms(summary.currentStd)} />
        <Tile label="Next predicted" value={ms(summary.nextPredictedMs)} />
        <Tile label="Anomalies"      value={String(summary.anomalyCount)} accent={summary.anomalyCount > 0} />
      </div>

      {/* Recent alerts */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Recent alerts
        </h3>
        {summary.alerts.length === 0 ? (
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 px-4 py-3 text-sm text-slate-500">
            No anomalies detected ✓
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {summary.alerts.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300">{clockTime(a.requestedAt)}</span>
                  <span className="tabular-nums text-xs text-slate-400">
                    {ms(a.responseTimeMs)}
                    {a.zScore != null && <span className="ml-1">z={a.zScore.toFixed(1)}</span>}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {a.reasons.map((r) => (
                    <span
                      key={r}
                      className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
                    >
                      {REASON_LABELS[r]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
