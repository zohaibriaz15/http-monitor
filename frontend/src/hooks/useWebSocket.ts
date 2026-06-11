import { useEffect, useRef, useState } from 'react';
import type { ConnectionStatus, WsMessage } from '../lib/types';

interface Options {
  onMessage?: (message: WsMessage) => void;
}

// WebSocket with auto-reconnect (capped exponential backoff). onMessage lives in
// a ref so changing it doesn't tear down the socket — the effect only deps on url.
export function useWebSocket(url: string, { onMessage }: Options = {}): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let closedByUs = false;

    function connect() {
      setStatus(attempts === 0 ? 'connecting' : 'reconnecting');
      ws = new WebSocket(url);

      ws.onopen = () => {
        attempts = 0;
        setStatus('open');
      };

      ws.onmessage = (event) => {
        try {
          onMessageRef.current?.(JSON.parse(event.data) as WsMessage);
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = () => {
        if (closedByUs) return;
        setStatus('reconnecting');
        const delay = Math.min(1000 * 2 ** attempts, 15_000);
        attempts += 1;
        reconnectTimer = setTimeout(connect, delay);
      };

      // An error is always followed by a close; let onclose drive reconnect.
      ws.onerror = () => ws?.close();
    }

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [url]);

  return status;
}
