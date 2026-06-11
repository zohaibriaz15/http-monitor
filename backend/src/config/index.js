'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Load .env once, from the backend root regardless of where node is launched.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';

function parseBool(value, fallback) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseInteger(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseNumber(value, fallback) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

// In the test environment we always talk to the dedicated test database so a
// test run never clobbers development data.
function resolveDatabaseUrl() {
  if (NODE_ENV === 'test') {
    return (
      process.env.TEST_DATABASE_URL ||
      'postgresql://localhost:5432/http_monitor_test'
    );
  }
  return process.env.DATABASE_URL || 'postgresql://localhost:5432/http_monitor_development';
}

const config = {
  env: NODE_ENV,
  isTest: NODE_ENV === 'test',
  port: parseInteger(process.env.PORT, 4000),
  databaseUrl: resolveDatabaseUrl(),
  databaseSsl: parseBool(process.env.DATABASE_SSL, false),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  monitor: {
    targetUrl: process.env.MONITOR_TARGET_URL || 'https://httpbin.org/anything',
    cron: process.env.MONITOR_CRON || '*/5 * * * *',
    runOnBoot: parseBool(process.env.MONITOR_RUN_ON_BOOT, true),
    requestTimeoutMs: parseInteger(process.env.MONITOR_REQUEST_TIMEOUT_MS, 10000),
  },
  anomaly: {
    // Rolling-statistics window. Spec: 1h minimum, 24h recommended.
    windowMs: Math.max(parseInteger(process.env.ANOMALY_WINDOW_HOURS, 24), 1) * 60 * 60 * 1000,
    // Z-score (and prediction-error/σ) threshold. 3 ≈ classic 3-sigma rule.
    zThreshold: parseNumber(process.env.ANOMALY_Z_THRESHOLD, 3),
    // EWMA smoothing factor for the one-step-ahead forecast (0<α≤1).
    ewmaAlpha: parseNumber(process.env.ANOMALY_EWMA_ALPHA, 0.3),
    // Minimum prior samples before we trust the stats enough to flag anomalies.
    minSamples: parseInteger(process.env.ANOMALY_MIN_SAMPLES, 5),
  },
};

module.exports = config;
