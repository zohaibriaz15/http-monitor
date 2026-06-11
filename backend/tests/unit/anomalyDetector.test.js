'use strict';

const {
  mean,
  stddev,
  zScore,
  ewmaStep,
  analyzeSeries,
  REASONS,
} = require('../../src/services/anomalyDetector');

const CFG = { windowMs: 60 * 60 * 1000, zThreshold: 3, alpha: 0.3, minSamples: 5 };

// Build an ascending series 1 minute apart. Each value is either a number
// (successful latency) or { rt, success } for explicit control.
function series(values, { startMs = 0, stepMs = 60_000 } = {}) {
  return values.map((v, i) => ({
    id: i + 1,
    requestedAt: new Date(startMs + i * stepMs).toISOString(),
    responseTimeMs: typeof v === 'number' ? v : v.rt,
    success: typeof v === 'number' ? true : v.success,
    statusCode: typeof v === 'number' ? 200 : v.statusCode ?? 200,
  }));
}

describe('statistical helpers', () => {
  it('computes the mean (and null for empty)', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBeNull();
  });

  it('computes sample standard deviation (n-1)', () => {
    expect(stddev([2, 4, 6])).toBeCloseTo(2); // var = (4+0+4)/2 = 4
    expect(stddev([5])).toBeNull(); // need ≥2 points
  });

  it('computes z-scores and guards against zero variance', () => {
    expect(zScore(10, 4, 2)).toBe(3);
    expect(zScore(100, 100, 0)).toBeNull(); // no spread → undefined z
    expect(zScore(5, 5, null)).toBeNull();
  });

  it('EWMA seeds with the first value then smooths', () => {
    expect(ewmaStep(null, 100, 0.5)).toBe(100);
    expect(ewmaStep(100, 200, 0.5)).toBe(150);
    expect(ewmaStep(150, 150, 0.3)).toBe(150);
  });
});

describe('analyzeSeries', () => {
  it('does not flag points while still warming up (below minSamples)', () => {
    const out = analyzeSeries(series([100, 9999]), CFG); // huge 2nd value, only 1 prior
    expect(out[1].warmingUp).toBe(true);
    expect(out[1].isAnomaly).toBe(false);
  });

  it('flags a clear latency spike with a high z-score', () => {
    const out = analyzeSeries(series([100, 102, 98, 101, 99, 100, 100, 101, 99, 500]), CFG);
    const last = out[out.length - 1];

    expect(last.isAnomaly).toBe(true);
    expect(last.reasons).toContain(REASONS.SPIKE);
    expect(last.zScore).toBeGreaterThan(3);
    // The spike also blows past the EWMA forecast → prediction-error fires too.
    expect(last.reasons).toContain(REASONS.PREDICTION);
    // Warm-up window is never flagged.
    expect(out.slice(0, 5).every((p) => !p.isAnomaly)).toBe(true);
  });

  it('flags a sharp drop as anomalous', () => {
    const out = analyzeSeries(series([100, 101, 99, 100, 101, 99, 100, 101, 99, 10]), CFG);
    const last = out[out.length - 1];
    expect(last.isAnomaly).toBe(true);
    expect(last.reasons).toContain(REASONS.DROP);
  });

  it('flags a failed request regardless of latency', () => {
    const out = analyzeSeries(
      series([100, 100, 100, 100, 100, 100, { rt: 100, success: false, statusCode: 503 }]),
      CFG
    );
    const last = out[out.length - 1];
    expect(last.success).toBe(false);
    expect(last.isAnomaly).toBe(true);
    expect(last.reasons).toContain(REASONS.FAILURE);
  });

  it('produces an ordered confidence band around the rolling mean', () => {
    const out = analyzeSeries(series([100, 110, 90, 105, 95, 100, 108]), CFG);
    const p = out[out.length - 1];
    expect(p.rollingMean).toBeGreaterThan(0);
    expect(p.rollingStd).toBeGreaterThan(0);
    expect(p.lowerBand).toBeLessThan(p.rollingMean);
    expect(p.upperBand).toBeGreaterThan(p.rollingMean);
    expect(p.lowerBand).toBeGreaterThanOrEqual(0); // band is clamped at 0
  });

  it('excludes failed requests from the latency baseline', () => {
    // A timeout in the middle must not poison the rolling mean/std.
    const out = analyzeSeries(
      series([100, 100, 100, { rt: 30000, success: false }, 100, 100, 100, 101]),
      CFG
    );
    const last = out[out.length - 1];
    expect(last.rollingMean).toBeLessThan(200); // not dragged toward 30000
  });
});
