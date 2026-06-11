'use strict';

const { AnalysisService } = require('../../src/services/analysisService');

const SETTINGS = { windowMs: 60 * 60 * 1000, zThreshold: 3, ewmaAlpha: 0.3, minSamples: 5 };

function series(values, { stepMs = 60_000 } = {}) {
  return values.map((v, i) => ({
    id: i + 1,
    requestedAt: new Date(i * stepMs).toISOString(),
    responseTimeMs: typeof v === 'number' ? v : v.rt,
    success: typeof v === 'number' ? true : v.success,
    statusCode: 200,
  }));
}

function serviceWith(points) {
  const repository = { listForAnalysis: jest.fn(async () => points) };
  return new AnalysisService({ repository, settings: SETTINGS });
}

describe('AnalysisService.analyze', () => {
  it('returns a per-point series, window metadata, and a summary', async () => {
    const points = series([100, 102, 98, 101, 99, 100, 100, 101, 99, 500]);
    const out = await serviceWith(points).analyze();

    expect(out.window.hours).toBe(1);
    expect(out.config.zThreshold).toBe(3);
    expect(out.points).toHaveLength(points.length);

    expect(out.summary.sampleCount).toBe(points.length); // all successful
    expect(out.summary.currentMean).toBeGreaterThan(0);
    expect(out.summary.nextPredictedMs).toBeGreaterThan(0);
    expect(out.summary.anomalyCount).toBe(1); // just the 500ms spike
    expect(out.summary.alerts[0].reasons).toContain('latency_spike');
  });

  it('reports a warming-up summary when there is too little data', async () => {
    const out = await serviceWith(series([100, 105])).analyze();
    expect(out.summary.warmingUp).toBe(true);
    expect(out.summary.anomalyCount).toBe(0);
  });

  it('classifyLatest returns the most recent point with its verdict', async () => {
    const points = series([100, 100, 100, 100, 100, 100, { rt: 100, success: false }]);
    const res = await serviceWith(points).classifyLatest();
    expect(res.latest.id).toBe(points.length);
    expect(res.latest.isAnomaly).toBe(true);
    expect(res.latest.reasons).toContain('request_failed');
  });

  it('classifyLatest returns null with no data', async () => {
    const res = await serviceWith([]).classifyLatest();
    expect(res).toBeNull();
  });
});
