'use strict';

const { MonitorService } = require('../../src/services/monitorService');

// Minimal fake of the WHATWG Response surface the service touches.
function fakeResponse({ ok = true, status = 200, statusText = 'OK', body = '{}' } = {}) {
  return { ok, status, statusText, text: async () => body };
}

const fixedPayload = { id: 'fixed', eventType: 'heartbeat' };

function buildService(overrides = {}) {
  const repository = { insertResult: jest.fn(async (r) => ({ id: 42, ...r })) };
  const broadcaster = { broadcast: jest.fn() };
  const service = new MonitorService({
    repository,
    broadcaster,
    payloadFactory: () => ({ ...fixedPayload }),
    targetUrl: 'https://example.test/anything',
    timeoutMs: 50,
    fetchImpl: jest.fn(),
    ...overrides,
  });
  return { service, repository, broadcaster };
}

describe('MonitorService.performRequest', () => {
  it('classifies a 2xx response as success', async () => {
    const fetchImpl = jest.fn(async () =>
      fakeResponse({ ok: true, status: 200, body: JSON.stringify({ hello: 'world' }) })
    );
    const { service } = buildService({ fetchImpl });

    const result = await service.performRequest();

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/anything',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(fixedPayload) })
    );
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.responseBody).toEqual({ hello: 'world' });
    expect(result.errorMessage).toBeNull();
    expect(typeof result.responseTimeMs).toBe('number');
    expect(result.requestedAt).toBeInstanceOf(Date);
  });

  it('classifies a 4xx/5xx response as failure but keeps the body', async () => {
    const fetchImpl = jest.fn(async () =>
      fakeResponse({ ok: false, status: 503, statusText: 'Service Unavailable', body: '{"down":true}' })
    );
    const { service } = buildService({ fetchImpl });

    const result = await service.performRequest();

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.responseBody).toEqual({ down: true });
    expect(result.errorMessage).toContain('503');
  });

  it('handles network errors gracefully', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const { service } = buildService({ fetchImpl });

    const result = await service.performRequest();

    expect(result.success).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.errorMessage).toBe('Request failed: ECONNREFUSED');
  });

  it('reports timeouts distinctly', async () => {
    const fetchImpl = jest.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    const { service } = buildService({ fetchImpl, timeoutMs: 1234 });

    const result = await service.performRequest();

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Request timed out after 1234ms');
  });

  it('wraps non-JSON bodies instead of throwing', async () => {
    const fetchImpl = jest.fn(async () => fakeResponse({ body: '<html>oops</html>' }));
    const { service } = buildService({ fetchImpl });

    const result = await service.performRequest();

    expect(result.responseBody).toEqual({ raw: '<html>oops</html>' });
  });

  it('treats an empty response body as null', async () => {
    const fetchImpl = jest.fn(async () => fakeResponse({ body: '' }));
    const { service } = buildService({ fetchImpl });

    const result = await service.performRequest();

    expect(result.responseBody).toBeNull();
  });

  it('sends JSON content-type and accept headers', async () => {
    const fetchImpl = jest.fn(async () => fakeResponse({ body: '{}' }));
    const { service } = buildService({ fetchImpl });

    await service.performRequest();

    const [, opts] = fetchImpl.mock.calls[0];
    expect(opts.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  });

  it('generates a fresh payload for every request', async () => {
    const payloadFactory = jest
      .fn()
      .mockReturnValueOnce({ seq: 1 })
      .mockReturnValueOnce({ seq: 2 });
    const fetchImpl = jest.fn(async () => fakeResponse({ body: '{}' }));
    const { service } = buildService({ fetchImpl, payloadFactory });

    await service.performRequest();
    await service.performRequest();

    expect(payloadFactory).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ seq: 1 });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ seq: 2 });
  });
});

describe('MonitorService.runOnce', () => {
  it('persists the result and broadcasts the saved record', async () => {
    const fetchImpl = jest.fn(async () => fakeResponse({ body: '{}' }));
    const { service, repository, broadcaster } = buildService({ fetchImpl });

    const saved = await service.runOnce();

    expect(repository.insertResult).toHaveBeenCalledTimes(1);
    expect(saved.id).toBe(42);
    expect(broadcaster.broadcast).toHaveBeenCalledWith({ type: 'monitor_result', data: saved });
  });

  it('still returns when broadcasting throws', async () => {
    const fetchImpl = jest.fn(async () => fakeResponse({ body: '{}' }));
    const broadcaster = {
      broadcast: jest.fn(() => {
        throw new Error('socket exploded');
      }),
    };
    const { service } = buildService({ fetchImpl, broadcaster });

    await expect(service.runOnce()).resolves.toMatchObject({ id: 42 });
  });

  it('propagates DB persistence failures to the caller', async () => {
    const fetchImpl = jest.fn(async () => fakeResponse({ body: '{}' }));
    const repository = {
      insertResult: jest.fn(async () => {
        throw new Error('db down');
      }),
    };
    const { service } = buildService({ fetchImpl, repository });

    await expect(service.runOnce()).rejects.toThrow('db down');
  });

  it('does not throw when no broadcaster is configured', async () => {
    const fetchImpl = jest.fn(async () => fakeResponse({ body: '{}' }));
    const { service } = buildService({ fetchImpl, broadcaster: null });

    await expect(service.runOnce()).resolves.toMatchObject({ id: 42 });
  });
});

describe('MonitorService.runOnce with anomaly analysis', () => {
  it('enriches the broadcast with the latest point verdict and summary', async () => {
    const fetchImpl = jest.fn(async () => fakeResponse({ body: '{}' }));
    const analysisService = {
      classifyLatest: jest.fn(async () => ({
        latest: { isAnomaly: true, reasons: ['latency_spike'], zScore: 4.2 },
        summary: { nextPredictedMs: 123, anomalyCount: 1 },
      })),
    };
    const { service, broadcaster } = buildService({ fetchImpl, analysisService });

    await service.runOnce();

    expect(analysisService.classifyLatest).toHaveBeenCalledTimes(1);
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'monitor_result',
        data: expect.objectContaining({
          id: 42,
          analysis: expect.objectContaining({ isAnomaly: true, reasons: ['latency_spike'] }),
        }),
        summary: expect.objectContaining({ nextPredictedMs: 123 }),
      })
    );
  });

  it('still broadcasts when analysis fails (best-effort)', async () => {
    const fetchImpl = jest.fn(async () => fakeResponse({ body: '{}' }));
    const analysisService = {
      classifyLatest: jest.fn(async () => {
        throw new Error('analysis exploded');
      }),
    };
    const { service, broadcaster } = buildService({ fetchImpl, analysisService });

    const saved = await service.runOnce();

    expect(saved.id).toBe(42);
    // Analysis failed → data still flows, just with a null verdict.
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'monitor_result',
        data: expect.objectContaining({ id: 42, analysis: null }),
      })
    );
  });
});
