import { QueryClient } from '@tanstack/react-query';

// Single shared client. Data is largely push-driven over the WebSocket, so we
// disable refetch-on-focus and lean on explicit invalidation / cache writes.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// Centralized query keys so cache reads/writes can't drift apart.
export const queryKeys = {
  results: ['results'] as const,
  stats: ['stats'] as const,
  analysis: ['analysis'] as const,
};
