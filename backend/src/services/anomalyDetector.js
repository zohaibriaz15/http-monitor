'use strict';

// Pure stats helpers — no deps, no side effects, so correctness is easy to test.

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Sample standard deviation (n-1). Returns null for fewer than 2 points.
function stddev(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  const variance = values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function zScore(value, m, sd) {
  if (m === null || sd === null || sd === 0) return null;
  return (value - m) / sd;
}

// EWMA (single exponential smoothing): level = α·x + (1-α)·prevLevel.
// The new level is the one-step-ahead forecast. Seeds with the first value.
function ewmaStep(prevLevel, value, alpha) {
  if (prevLevel === null || prevLevel === undefined) return value;
  return alpha * value + (1 - alpha) * prevLevel;
}

const REASONS = {
  FAILURE: 'request_failed',
  SPIKE: 'latency_spike',
  DROP: 'latency_drop',
  PREDICTION: 'prediction_error',
};

// Walk an ascending series and annotate each point with the rolling mean/std,
// forecast, ±zσ band, z-score, and anomaly verdict. Each point is judged against
// the window *before* it (so it can't mask its own anomaly). O(n) two-pointer.
//
// points: [{ id, requestedAt, responseTimeMs, success, statusCode }] ascending
function analyzeSeries(points, config) {
  const { windowMs, zThreshold, alpha, minSamples } = config;

  const window = []; // successful { t, v } currently inside the rolling window
  let sum = 0;
  let sumSq = 0;
  let level = null; // EWMA forecast level from prior successful points

  const analyzed = [];

  for (const p of points) {
    const t = new Date(p.requestedAt).getTime();
    const rt = p.responseTimeMs;

    // Evict points that have aged out of the window (left edge of two-pointer).
    while (window.length > 0 && window[0].t < t - windowMs) {
      const old = window.shift();
      sum -= old.v;
      sumSq -= old.v * old.v;
    }

    // Stats over the PRIOR window (current point not yet added).
    const n = window.length;
    const rollingMean = n > 0 ? sum / n : null;
    const rollingStd =
      n > 1 ? Math.sqrt(Math.max(0, (sumSq - (sum * sum) / n) / (n - 1))) : null;
    const predicted = level;
    const warmingUp = n < minSamples;

    const upperBand = rollingMean !== null && rollingStd !== null ? rollingMean + zThreshold * rollingStd : null;
    const lowerBand = rollingMean !== null && rollingStd !== null ? Math.max(0, rollingMean - zThreshold * rollingStd) : null;

    const z = p.success ? zScore(rt, rollingMean, rollingStd) : null;
    const predictionError = predicted !== null && rt !== null ? rt - predicted : null;

    const reasons = [];
    if (!p.success) {
      reasons.push(REASONS.FAILURE);
    } else if (!warmingUp) {
      if (z !== null && Math.abs(z) > zThreshold) {
        reasons.push(z > 0 ? REASONS.SPIKE : REASONS.DROP);
      }
      if (
        rollingStd !== null &&
        rollingStd > 0 &&
        predictionError !== null &&
        Math.abs(predictionError) / rollingStd > zThreshold
      ) {
        reasons.push(REASONS.PREDICTION);
      }
    }

    analyzed.push({
      id: p.id,
      requestedAt: p.requestedAt,
      responseTimeMs: rt,
      success: p.success,
      statusCode: p.statusCode ?? null,
      rollingMean,
      rollingStd,
      upperBand,
      lowerBand,
      predicted,
      zScore: z,
      predictionError,
      isAnomaly: reasons.length > 0,
      reasons,
      warmingUp,
    });

    // Update state AFTER classifying (only successful latencies feed the model).
    if (p.success && rt !== null) {
      window.push({ t, v: rt });
      sum += rt;
      sumSq += rt * rt;
      level = ewmaStep(level, rt, alpha);
    }
  }

  return analyzed;
}

module.exports = { mean, stddev, zScore, ewmaStep, analyzeSeries, REASONS };
