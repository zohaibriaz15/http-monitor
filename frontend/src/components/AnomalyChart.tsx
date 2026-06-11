import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { AnalysisPoint } from '../lib/types';

const COLORS = {
  actual: '#e2e8f0',
  mean: '#4f9cf9',
  predicted: '#a78bfa',
  band: '#4f9cf9',
  anomaly: '#f85149',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface Row {
  time: string;
  responseTimeMs: number | null;
  rollingMean: number | null;
  predicted: number | null;
  band?: [number, number];
  anomalyValue: number | null;
}

// Recharts tooltip is fed our Row; render only the meaningful fields.
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row: Row = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-600 bg-slate-900/95 px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-slate-200">{label}</div>
      <div className="text-slate-300">Response: {fmt(row.responseTimeMs)} ms</div>
      <div style={{ color: COLORS.mean }}>Rolling mean: {fmt(row.rollingMean)} ms</div>
      <div style={{ color: COLORS.predicted }}>Predicted: {fmt(row.predicted)} ms</div>
      {row.band && (
        <div className="text-slate-400">
          Band: {fmt(row.band[0])}–{fmt(row.band[1])} ms
        </div>
      )}
      {row.anomalyValue != null && <div className="font-semibold text-fail">⚠ Anomaly</div>}
    </div>
  );
}

function fmt(v: number | null): string {
  return v == null ? '—' : String(Math.round(v));
}

export default function AnomalyChart({ points }: { points: AnalysisPoint[] }) {
  const data = useMemo<Row[]>(
    () =>
      points.map((p) => ({
        time: formatTime(p.requestedAt),
        responseTimeMs: p.responseTimeMs,
        rollingMean: p.rollingMean,
        predicted: p.predicted,
        band:
          p.lowerBand != null && p.upperBand != null ? [p.lowerBand, p.upperBand] : undefined,
        anomalyValue: p.isAnomaly ? p.responseTimeMs : null,
      })),
    [points],
  );

  if (!points.length) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800/60 text-slate-400">
        Collecting data… the chart appears once the first results arrive.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={48} unit="" />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />

          {/* mean ± zσ band — Recharts renders a [min, max] dataKey as a range area */}
          <Area
            dataKey="band"
            name="Confidence band (±zσ)"
            stroke="none"
            fill={COLORS.band}
            fillOpacity={0.12}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            dataKey="rollingMean"
            name="Rolling mean"
            stroke={COLORS.mean}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="predicted"
            name="Predicted"
            stroke={COLORS.predicted}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="responseTimeMs"
            name="Response time"
            stroke={COLORS.actual}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Scatter dataKey="anomalyValue" name="Anomaly" fill={COLORS.anomaly} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
