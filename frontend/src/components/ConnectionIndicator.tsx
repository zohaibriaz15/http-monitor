import type { ConnectionStatus } from '../lib/types';

const META: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
  open: { label: 'Live', dot: 'bg-ok shadow-[0_0_0_3px_rgba(63,185,80,0.2)]', text: 'text-ok' },
  connecting: { label: 'Connecting…', dot: 'bg-amber-400 animate-pulse-slow', text: 'text-amber-400' },
  reconnecting: { label: 'Reconnecting…', dot: 'bg-amber-400 animate-pulse-slow', text: 'text-amber-400' },
};

export default function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const meta = META[status];
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-medium ${meta.text}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
