'use strict';

const request = require('supertest');
const { createApp } = require('../../src/app');
const { runMigrations } = require('../../src/db/migrate');
const db = require('../../src/db/pool');
const repository = require('../../src/repositories/monitorRepository');

// A fake monitor service for the POST /run route: writes a real row via the
// repository so we exercise the route + DB without hitting the network.
const fakeMonitorService = {
  runOnce: async () =>
    repository.insertResult({
      targetUrl: 'https://example.test/anything',
      requestPayload: { triggered: true },
      success: true,
      statusCode: 200,
      responseTimeMs: 5,
      responseBody: { ok: true },
      errorMessage: null,
      requestedAt: new Date(),
    }),
};

const app = createApp({ monitorService: fakeMonitorService });

function seed(overrides = {}) {
  return repository.insertResult({
    targetUrl: 'https://example.test/anything',
    requestPayload: { n: 1 },
    success: true,
    statusCode: 200,
    responseTimeMs: 100,
    responseBody: { ok: true },
    errorMessage: null,
    requestedAt: new Date(),
    ...overrides,
  });
}

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await repository.deleteAll();
});

afterAll(async () => {
  await db.close();
});

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.env).toBe('test');
  });
});

describe('GET /api/results', () => {
  it('returns an empty, paginated payload when there is no data', async () => {
    const res = await request(app).get('/api/results');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], total: 0, limit: 25, offset: 0 });
  });

  it('returns stored results newest-first', async () => {
    await seed({ requestPayload: { n: 1 }, requestedAt: new Date('2026-01-01T00:00:00Z') });
    await seed({ requestPayload: { n: 2 }, requestedAt: new Date('2026-01-02T00:00:00Z') });

    const res = await request(app).get('/api/results');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items[0].requestPayload.n).toBe(2);
    expect(res.body.items[1].requestPayload.n).toBe(1);
  });

  it('honors limit and offset', async () => {
    await seed();
    await seed();
    await seed();

    const res = await request(app).get('/api/results?limit=2&offset=0');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect(res.body.limit).toBe(2);
  });

  it('filters by success', async () => {
    await seed({ success: true });
    await seed({ success: false, statusCode: null, errorMessage: 'boom' });

    const ok = await request(app).get('/api/results?success=true');
    expect(ok.body.total).toBe(1);
    expect(ok.body.items[0].success).toBe(true);

    const failed = await request(app).get('/api/results?success=false');
    expect(failed.body.total).toBe(1);
    expect(failed.body.items[0].success).toBe(false);
  });

  it('rejects an invalid success filter with 400', async () => {
    const res = await request(app).get('/api/results?success=maybe');
    expect(res.status).toBe(400);
    expect(res.body.error.status).toBe(400);
  });

  it('clamps an oversized limit to the max (100)', async () => {
    const res = await request(app).get('/api/results?limit=99999');
    expect(res.body.limit).toBe(100);
  });
});

describe('GET /api/results/:id', () => {
  it('returns a single record', async () => {
    const created = await seed();
    const res = await request(app).get(`/api/results/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
  });

  it('returns 404 for a missing record', async () => {
    const res = await request(app).get('/api/results/123456');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-numeric id', async () => {
    const res = await request(app).get('/api/results/not-a-number');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/stats', () => {
  it('aggregates totals', async () => {
    await seed({ success: true });
    await seed({ success: true });
    await seed({ success: false, errorMessage: 'x' });

    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 3, successes: 2, failures: 1 });
  });
});

describe('POST /api/monitor/run', () => {
  it('triggers a cycle and returns the created record', async () => {
    const res = await request(app).post('/api/monitor/run');
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.requestPayload.triggered).toBe(true);

    // And it is now retrievable via the history endpoint.
    const list = await request(app).get('/api/results');
    expect(list.body.total).toBe(1);
  });
});

describe('GET /api/analysis', () => {
  it('returns rolling stats, a forecast, and per-point anomaly verdicts', async () => {
    for (let i = 0; i < 6; i += 1) {
      await seed({ responseTimeMs: 100 + i });
    }

    const res = await request(app).get('/api/analysis');
    expect(res.status).toBe(200);
    expect(res.body.window.hours).toBeGreaterThanOrEqual(1);
    expect(res.body.config).toHaveProperty('zThreshold');
    expect(res.body.points).toHaveLength(6);
    expect(res.body.summary.sampleCount).toBe(6);
    expect(res.body.summary).toHaveProperty('nextPredictedMs');
    expect(Array.isArray(res.body.summary.alerts)).toBe(true);
  });
});

describe('unknown routes', () => {
  it('returns 404 JSON', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.status).toBe(404);
  });
});
