import type { Stats } from '../lib/types';

function successRate(stats: Stats | null): string {
  if (!stats || !stats.total) return '—';
  return `${Math.round((stats.successes / stats.total) * 100)}%`;
}

function Card({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: 'ok' | 'fail';
}) {
  const valueColor = accent === 'ok' ? 'text-ok' : accent === 'fail' ? 'text-fail' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <div className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

export default function StatsBar({ stats }: { stats: Stats | null }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Card label="Total Requests" value={stats ? stats.total : '—'} />
      <Card label="Successful" value={stats ? stats.successes : '—'} accent="ok" />
      <Card label="Failed" value={stats ? stats.failures : '—'} accent="fail" />
      <Card label="Success Rate" value={successRate(stats)} />
      <Card
        label="Avg Latency"
        value={stats && stats.avgResponseTimeMs != null ? `${stats.avgResponseTimeMs} ms` : '—'}
      />
    </section>
  );
}
