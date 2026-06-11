import type { AnalysisResponse, AnomalyReason } from '../lib/types';

const REASON_LABELS: Record<AnomalyReason, string> = {
  request_failed: 'Request failed',
  latency_spike: 'Latency spike',
  latency_drop: 'Latency drop',
  prediction_error: 'Prediction error',
};

function ms(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)} ms`;
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
      <div className={`text-lg font-semibold tabular-nums ${accent ? 'text-fail' : 'text-slate-100'}`}>
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
    <div className="flex h-full flex-col rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Anomaly Detection
        </h2>
        {summary.warmingUp && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-300">
            warming up
          </span>
        )}
      </div>

      <p className="mb-3 text-xs text-slate-500">
        z-score over a {window.hours}h window · threshold ±{config.zThreshold}σ · EWMA α=
        {config.ewmaAlpha}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Rolling mean" value={ms(summary.currentMean)} />
        <Tile label="Std deviation" value={ms(summary.currentStd)} />
        <Tile label="Next predicted" value={ms(summary.nextPredictedMs)} />
        <Tile label="Anomalies" value={String(summary.anomalyCount)} accent={summary.anomalyCount > 0} />
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Recent alerts
        </h3>
        {summary.alerts.length === 0 ? (
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 px-3 py-4 text-center text-sm text-slate-500">
            No anomalies detected ✓
          </div>
        ) : (
          <ul className="flex-1 space-y-2 overflow-y-auto pr-1">
            {summary.alerts.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-fail/30 bg-fail/5 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{clockTime(a.requestedAt)}</span>
                  <span className="tabular-nums text-slate-400">
                    {ms(a.responseTimeMs)}
                    {a.zScore != null && <span className="ml-2">z={a.zScore.toFixed(1)}</span>}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.reasons.map((r) => (
                    <span
                      key={r}
                      className="rounded bg-fail/15 px-1.5 py-0.5 text-[11px] font-medium text-fail"
                    >
                      {REASON_LABELS[r]}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
