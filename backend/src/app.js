'use strict';

const express = require('express');
const cors = require('cors');
const config = require('./config');
const db = require('./db/pool');
const { createMonitorRouter } = require('./routes/monitorRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

// Readiness probe: pings the DB and reports scheduler + WS state. Returns 503
// when the DB is down so a process that's up but can't serve doesn't look healthy.
function createHealthHandler({ scheduler = null, broadcaster = null } = {}) {
  return async (req, res) => {
    const startedAt = process.hrtime.bigint();
    let dbConnected = false;
    let dbError;
    try {
      await db.query('SELECT 1');
      dbConnected = true;
    } catch (err) {
      dbError = err.message;
    }
    const dbLatencyMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);

    res.status(dbConnected ? 200 : 503).json({
      status: dbConnected ? 'ok' : 'degraded',
      env: config.env,
      uptimeSec: Math.round(process.uptime()),
      time: new Date().toISOString(),
      checks: {
        database: {
          connected: dbConnected,
          latencyMs: dbLatencyMs,
          ...(dbError ? { error: dbError } : {}),
        },
        monitor: scheduler
          ? { scheduled: scheduler.isScheduled, schedule: scheduler.schedule, runInProgress: scheduler.isRunning }
          : { scheduled: false },
        websocket: { clients: broadcaster ? broadcaster.clientCount : 0 },
      },
    });
  };
}

// Builds the Express app without binding a port, so tests can drive it via
// supertest and the server entrypoint can attach WebSockets to it.
function createApp({ monitorService = null, scheduler = null, broadcaster = null, analysisService } = {}) {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', createHealthHandler({ scheduler, broadcaster }));

  app.use('/api', createMonitorRouter({ monitorService, analysisService }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
