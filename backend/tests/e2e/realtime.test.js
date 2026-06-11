'use strict';

const http = require('http');
const { WebSocket } = require('ws');
const { createApp } = require('../../src/app');
const { Broadcaster } = require('../../src/realtime/broadcaster');
const { MonitorService } = require('../../src/services/monitorService');
const { runMigrations } = require('../../src/db/migrate');
const repository = require('../../src/repositories/monitorRepository');
const db = require('../../src/db/pool');

let server;
let broadcaster;
let baseUrl;
let wsUrl;

// Fake fetch so the e2e exercises the real DB + WebSocket pipeline without
// depending on httpbin.org being reachable from CI.
const fakeFetch = async () => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  text: async () => JSON.stringify({ echoed: true }),
});

beforeAll(async () => {
  await runMigrations();

  broadcaster = new Broadcaster();
  const monitorService = new MonitorService({
    broadcaster,
    fetchImpl: fakeFetch,
    targetUrl: 'https://example.test/anything',
  });

  const app = createApp({ monitorService, broadcaster });
  server = http.createServer(app);
  broadcaster.attach(server, { path: '/ws' });

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}/ws`;
});

afterAll(async () => {
  broadcaster.close();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});

beforeEach(async () => {
  await repository.deleteAll();
});

describe('real-time monitor flow (e2e)', () => {
  it('triggers a cycle, streams it to a connected client, and persists it', async () => {
    const ws = new WebSocket(wsUrl);
    const types = [];
    const gotResult = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no monitor_result within 5s')), 5000);
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        types.push(msg.type);
        if (msg.type === 'monitor_result') {
          clearTimeout(timer);
          resolve(msg);
        }
      });
      ws.on('error', reject);
    });

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // Trigger one cycle through the real HTTP endpoint.
    const res = await fetch(`${baseUrl}/api/monitor/run`, { method: 'POST' });
    expect(res.status).toBe(201);
    const created = await res.json();

    const broadcast = await gotResult;
    expect(types[0]).toBe('connected'); // greeting frame on connect
    expect(broadcast.data.id).toBe(created.id); // same record streamed live
    expect(broadcast.data.success).toBe(true);

    // And it is persisted / queryable via the history endpoint.
    const list = await fetch(`${baseUrl}/api/results?limit=5`).then((r) => r.json());
    expect(list.items.some((item) => item.id === created.id)).toBe(true);

    ws.close();
  });
});
