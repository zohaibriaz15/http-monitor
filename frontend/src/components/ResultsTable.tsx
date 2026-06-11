import { useState } from 'react';
import type { MonitorResult } from '../lib/types';
import StatusBadge from './StatusBadge';

function formatTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function Row({ record, isNew }: { record: MonitorResult; isNew: boolean }) {
  const [open, setOpen] = useState(false);
  const payload = record.requestPayload ?? {};

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className={`cursor-pointer border-t border-slate-700/70 hover:bg-slate-700/30 ${
          isNew ? 'animate-flash' : ''
        }`}
      >
        <td className="px-3 py-2.5 text-slate-400 tabular-nums">{record.id}</td>
        <td className="px-3 py-2.5 whitespace-nowrap">{formatTime(record.requestedAt)}</td>
        <td className="px-3 py-2.5">
          <StatusBadge success={record.success} statusCode={record.statusCode} />
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          {record.responseTimeMs != null ? `${record.responseTimeMs} ms` : '—'}
        </td>
        <td className="hidden px-3 py-2.5 sm:table-cell">{String(payload.eventType ?? '—')}</td>
        <td className="hidden px-3 py-2.5 sm:table-cell">{String(payload.region ?? '—')}</td>
        <td className="hidden px-3 py-2.5 font-mono text-xs text-slate-400 md:table-cell">
          {String(payload.id ?? '—')}
        </td>
        <td className="px-3 py-2.5 text-center text-slate-500">{open ? '▾' : '▸'}</td>
      </tr>

      {open && (
        <tr className="bg-slate-900/60">
          <td colSpan={8} className="px-3 py-3">
            {record.errorMessage && (
              <div className="mb-3 rounded-md border border-fail/40 bg-fail/10 px-3 py-2 text-sm text-red-300">
                ⚠ {record.errorMessage}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-1.5 text-xs uppercase tracking-wide text-slate-400">Request Payload</h4>
                <pre className="max-h-64 overflow-auto rounded-md border border-slate-700 bg-slate-800 p-3 text-xs">
                  {JSON.stringify(record.requestPayload, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="mb-1.5 text-xs uppercase tracking-wide text-slate-400">Response Body</h4>
                <pre className="max-h-64 overflow-auto rounded-md border border-slate-700 bg-slate-800 p-3 text-xs">
                  {record.responseBody ? JSON.stringify(record.responseBody, null, 2) : '— no body —'}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ResultsTable({
  results,
  newestId,
}: {
  results: MonitorResult[];
  newestId: number | null;
}) {
  if (!results.length) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-10 text-center text-slate-400">
        No data yet. Waiting for the first monitor result…
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800/60">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2.5 font-medium">ID</th>
            <th className="px-3 py-2.5 font-medium">Time</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 text-right font-medium">Latency</th>
            <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Event</th>
            <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Region</th>
            <th className="hidden px-3 py-2.5 font-medium md:table-cell">Payload ID</th>
            <th className="px-3 py-2.5" aria-label="expand" />
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <Row key={r.id} record={r} isNew={r.id === newestId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
