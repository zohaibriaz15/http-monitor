'use strict';

const http = require('http');
const config = require('./config');
const logger = require('./logger');
const db = require('./db/pool');
const { runMigrations } = require('./db/migrate');
const { createApp } = require('./app');
const { MonitorService } = require('./services/monitorService');
const { MonitorScheduler } = require('./services/scheduler');
const { Broadcaster } = require('./realtime/broadcaster');
const { AnalysisService } = require('./services/analysisService');

async function main() {
  // Ensure schema is present before we accept traffic or run the monitor.
  await runMigrations();

  const broadcaster = new Broadcaster();
  const analysisService = new AnalysisService();
  const monitorService = new MonitorService({ broadcaster, analysisService });
  const scheduler = new MonitorScheduler(monitorService);

  const app = createApp({ monitorService, scheduler, broadcaster, analysisService });
  const server = http.createServer(app);

  broadcaster.attach(server, { path: '/ws' });

  await new Promise((resolve) => server.listen(config.port, resolve));
  logger.info(`HTTP + WS server listening on http://localhost:${config.port}`);
  logger.info(`WebSocket endpoint: ws://localhost:${config.port}/ws`);

  scheduler.start();

  // Graceful shutdown: stop the cron, close sockets, drain the server and pool.
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down...`);
    scheduler.stop();
    broadcaster.close();
    server.close(() => logger.info('HTTP server closed.'));
    try {
      await db.close();
    } catch (err) {
      logger.error('Error closing DB pool', err.message);
    }
    process.exit(0);
  }

  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

  return { server, scheduler, broadcaster };
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = { main };
