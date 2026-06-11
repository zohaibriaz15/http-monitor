import { useState } from 'react';
import { useMonitorData } from './hooks/useMonitorData';
import { triggerRun } from './lib/api';
import StatsBar from './components/StatsBar';
import ResultsTable from './components/ResultsTable';
import ConnectionIndicator from './components/ConnectionIndicator';
import AnomalyChart from './components/AnomalyChart';
import AnomalyPanel from './components/AnomalyPanel';

export default function App() {
  const { results, stats, analysis, loading, error, connection, newestId, page, setPage, totalPages, total } = useMonitorData();
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  async function handleRun() {
    setTriggering(true);
    setTriggerError(null);
    try {
      await triggerRun();
      // The new record streams back over the WebSocket and updates the table.
    } catch (err) {
      setTriggerError((err as Error).message);
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">HTTP Monitor</h1>
          <p className="mt-1 text-sm text-slate-400">
            Pinging <code className="rounded bg-slate-800 px-1.5 py-0.5">httpbin.org/anything</code> every 5 minutes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionIndicator status={connection} />
          <button
            onClick={handleRun}
            disabled={triggering}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-default disabled:opacity-60"
          >
            {triggering ? 'Running…' : 'Run now'}
          </button>
        </div>
      </header>

      {triggerError && (
        <div className="mb-4 rounded-lg border border-fail bg-fail/10 px-4 py-2.5 text-sm text-red-300">
          Trigger failed: {triggerError}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-fail bg-fail/10 px-4 py-2.5 text-sm text-red-300">
          Failed to load data: {error}. Is the backend running on the configured API base?
        </div>
      )}

      <div className="mb-6">
        <StatsBar stats={stats} />
      </div>

      <div className="mb-4">
        <AnomalyChart points={analysis?.points ?? []} />
      </div>

      <div className="mb-6">
        <AnomalyPanel analysis={analysis} />
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-10 text-center text-slate-400">
          Loading…
        </div>
      ) : (
        <ResultsTable
          results={results}
          newestId={newestId}
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
      )}

      <footer className="mt-6 text-center text-xs text-slate-500">
        {total} total results · page {page} of {totalPages} · updates live via WebSocket
      </footer>
    </div>
  );
}
