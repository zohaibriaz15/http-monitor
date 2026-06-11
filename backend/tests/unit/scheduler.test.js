'use strict';

const { MonitorScheduler } = require('../../src/services/scheduler');

// A promise we can resolve on demand, to model an in-flight monitor run.
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const VALID_CRON = '*/5 * * * *';

describe('MonitorScheduler', () => {
  it('runs once immediately on boot when runOnBoot is true', async () => {
    const monitorService = { runOnce: jest.fn(async () => ({ id: 1 })) };
    const scheduler = new MonitorScheduler(monitorService, { schedule: VALID_CRON, runOnBoot: true });

    scheduler.start();
    await Promise.resolve(); // let the fire-and-forget boot tick start

    expect(monitorService.runOnce).toHaveBeenCalledTimes(1);
    expect(scheduler.isScheduled).toBe(true);

    scheduler.stop();
    expect(scheduler.isScheduled).toBe(false);
  });

  it('does not run on boot when runOnBoot is false', () => {
    const monitorService = { runOnce: jest.fn() };
    const scheduler = new MonitorScheduler(monitorService, { schedule: VALID_CRON, runOnBoot: false });

    scheduler.start();

    expect(monitorService.runOnce).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('throws on an invalid cron expression', () => {
    const scheduler = new MonitorScheduler({ runOnce: jest.fn() }, { schedule: 'not-a-cron', runOnBoot: false });
    expect(() => scheduler.start()).toThrow(/Invalid cron/);
  });

  it('skips overlapping ticks while a run is in progress', async () => {
    const d = deferred();
    const monitorService = { runOnce: jest.fn(() => d.promise) };
    const scheduler = new MonitorScheduler(monitorService, { schedule: VALID_CRON, runOnBoot: false });

    const first = scheduler.tick(); // starts a run (still pending)
    const second = scheduler.tick(); // should be skipped — a run is in progress
    expect(monitorService.runOnce).toHaveBeenCalledTimes(1);

    d.resolve({ id: 1 });
    await Promise.all([first, second]);

    // Once the previous run finishes, a new tick runs again.
    await scheduler.tick();
    expect(monitorService.runOnce).toHaveBeenCalledTimes(2);
  });

  it('swallows runOnce errors so the cron keeps ticking', async () => {
    const monitorService = {
      runOnce: jest.fn(async () => {
        throw new Error('boom');
      }),
    };
    const scheduler = new MonitorScheduler(monitorService, { schedule: VALID_CRON, runOnBoot: false });

    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(scheduler.isRunning).toBe(false); // reset so the next tick can run
  });
});
