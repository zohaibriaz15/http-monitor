import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAnalysis, fetchResults, fetchStats } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { MAX_ANALYSIS_POINTS, MAX_ROWS, WS_URL } from '../lib/config';
import type { AnalysisResponse, ResultsPage, Stats, WsMessage } from '../lib/types';
import { useWebSocket } from './useWebSocket';

// The dashboard's data layer: React Query handles the initial REST load + cache,
// and the WebSocket merges live results into that same cache. Stats are bumped
// optimistically then reconciled from the server (debounced) for an accurate avg.
export function useMonitorData() {
  const queryClient = useQueryClient();
  const [newestId, setNewestId] = useState<number | null>(null);
  const statsTimer = useRef<ReturnType<typeof setTimeout>>();

  const resultsQuery = useQuery({
    queryKey: queryKeys.results,
    queryFn: () => fetchResults({ limit: MAX_ROWS }),
  });

  const statsQuery = useQuery({
    queryKey: queryKeys.stats,
    queryFn: fetchStats,
  });

  const analysisQuery = useQuery({
    queryKey: queryKeys.analysis,
    queryFn: fetchAnalysis,
  });

  const handleMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type !== 'monitor_result') return;
      const record = msg.data;

      // Prepend the new record, drop any duplicate id, and cap the list length.
      queryClient.setQueryData<ResultsPage>(queryKeys.results, (prev) => {
        const items = prev?.items ?? [];
        const next = [record, ...items.filter((r) => r.id !== record.id)].slice(0, MAX_ROWS);
        return { items: next, total: (prev?.total ?? 0) + 1, limit: MAX_ROWS, offset: 0 };
      });

      // Optimistic stats bump (counts are exact; avg is fixed up below).
      queryClient.setQueryData<Stats>(queryKeys.stats, (prev) =>
        prev
          ? {
              ...prev,
              total: prev.total + 1,
              successes: prev.successes + (record.success ? 1 : 0),
              failures: prev.failures + (record.success ? 0 : 1),
              lastRequestedAt: record.requestedAt,
            }
          : prev,
      );

      // The backend already computed this point's verdict, so just append it —
      // no recomputation on the UI thread.
      if (record.analysis) {
        const point = record.analysis;
        queryClient.setQueryData<AnalysisResponse>(queryKeys.analysis, (prev) => {
          if (!prev) return prev;
          const points = [...prev.points.filter((p) => p.id !== point.id), point].slice(
            -MAX_ANALYSIS_POINTS,
          );
          return { ...prev, points, summary: msg.summary ?? prev.summary };
        });
      }

      setNewestId(record.id);

      // Reconcile exact aggregates from the server, debounced against bursts.
      clearTimeout(statsTimer.current);
      statsTimer.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      }, 1500);
    },
    [queryClient],
  );

  const connection = useWebSocket(WS_URL, { onMessage: handleMessage });

  // After a dropped connection is restored, refetch to catch anything missed
  // while we were offline.
  const prevConnection = useRef(connection);
  useEffect(() => {
    if (prevConnection.current === 'reconnecting' && connection === 'open') {
      queryClient.invalidateQueries({ queryKey: queryKeys.results });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.analysis });
    }
    prevConnection.current = connection;
  }, [connection, queryClient]);

  useEffect(() => () => clearTimeout(statsTimer.current), []);

  return {
    results: resultsQuery.data?.items ?? [],
    stats: statsQuery.data ?? null,
    analysis: analysisQuery.data ?? null,
    loading: resultsQuery.isLoading,
    error: resultsQuery.error ? (resultsQuery.error as Error).message : null,
    connection,
    newestId,
  };
}
