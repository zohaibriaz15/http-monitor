'use strict';

const cron = require('node-cron');
const config = require('../config');
const logger = require('../logger');

// Wraps node-cron around a MonitorService. Guards against overlapping runs so a
// slow request (up to the timeout) can never pile up behind the next tick.
class MonitorScheduler {
  constructor(monitorService, { schedule = config.monitor.cron, runOnBoot = config.monitor.runOnBoot } = {}) {
    this.monitorService = monitorService;
    this.schedule = schedule;
    this.runOnBoot = runOnBoot;
    this.task = null;
    this.isRunning = false;
  }

  start() {
    if (!cron.validate(this.schedule)) {
      throw new Error(`Invalid cron expression: "${this.schedule}"`);
    }

    this.task = cron.schedule(this.schedule, () => this.tick());
    logger.info(`Monitor scheduled with cron "${this.schedule}"`);

    if (this.runOnBoot) {
      // Fire immediately so there's data without waiting for the first interval.
      this.tick();
    }
    return this;
  }

  async tick() {
    if (this.isRunning) {
      logger.warn('Previous monitor run still in progress; skipping this tick.');
      return;
    }
    this.isRunning = true;
    try {
      await this.monitorService.runOnce();
    } catch (err) {
      // Already logged downstream; swallow so cron keeps ticking.
      logger.error('Monitor tick failed', err.message);
    } finally {
      this.isRunning = false;
    }
  }

  // True once start() has registered the cron task (and until stop()).
  get isScheduled() {
    return this.task != null;
  }

  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('Monitor scheduler stopped.');
    }
  }
}

module.exports = { MonitorScheduler };
