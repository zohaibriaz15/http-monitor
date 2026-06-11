'use strict';

const express = require('express');
const repository = require('../repositories/monitorRepository');
const { analysisService: defaultAnalysisService } = require('../services/analysisService');
const { ApiError } = require('../middleware/errorHandler');

// Wraps async handlers so rejected promises reach the error middleware.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Parses ?success=true|false into a boolean or undefined (no filter).
function parseSuccessFilter(value) {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ApiError(400, "Query param 'success' must be 'true' or 'false'");
}

// `monitorService` is injected so POST /run can trigger a real cycle.
function createMonitorRouter({ monitorService, analysisService = defaultAnalysisService } = {}) {
  const router = express.Router();

  // Anomaly analysis over the rolling window: per-point rolling stats, forecast,
  // confidence band, and anomaly verdicts, plus a summary + recent alerts.
  router.get(
    '/analysis',
    asyncHandler(async (req, res) => {
      res.json(await analysisService.analyze());
    })
  );

  // Historical data, most-recent-first, paginated.
  router.get(
    '/results',
    asyncHandler(async (req, res) => {
      const { limit, offset, success, sortBy, order } = req.query;
      const result = await repository.listResults({
        limit,
        offset,
        success: parseSuccessFilter(success),
        sortBy,
        order,
      });
      res.json(result);
    })
  );

  // Aggregate stats — handy for the dashboard header.
  router.get(
    '/stats',
    asyncHandler(async (req, res) => {
      res.json(await repository.getStats());
    })
  );

  // Single record by id.
  router.get(
    '/results/:id',
    asyncHandler(async (req, res) => {
      const record = await repository.findById(req.params.id);
      if (!record) throw new ApiError(404, `No monitor result with id ${req.params.id}`);
      res.json(record);
    })
  );

  // Manually trigger a monitor cycle (useful for demos and testing the pipeline
  // without waiting up to 5 minutes for the next cron tick).
  router.post(
    '/monitor/run',
    asyncHandler(async (req, res) => {
      if (!monitorService) throw new ApiError(503, 'Monitor service is not available');
      const record = await monitorService.runOnce();
      res.status(201).json(record);
    })
  );

  return router;
}

module.exports = { createMonitorRouter };
