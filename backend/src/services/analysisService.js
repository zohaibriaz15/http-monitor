'use strict';

const config = require('../config');
const defaultRepository = require('../repositories/monitorRepository');
const { analyzeSeries, mean, stddev, ewmaStep } = require('./anomalyDetector');

// Connects the pure detector to stored data: pulls the window, runs the
// analysis, and builds the summary (current stats, forecast, recent alerts).
class AnalysisService {
  constructor({ repository = defaultRepository, settings = config.anomaly } = {}) {
    this.repository = repository;
    this.settings = settings;
  }

  coreConfig() {
    return {
      windowMs: this.settings.windowMs,
      zThreshold: this.settings.zThreshold,
      alpha: this.settings.ewmaAlpha,
      minSamples: this.settings.minSamples,
    };
  }

  // Full per-point series + summary, for GET /api/analysis.
  async analyze() {
    const cfg = this.coreConfig();
    const points = await this.repository.listForAnalysis(cfg.windowMs);
    const analyzed = analyzeSeries(points, cfg);
    return {
      window: { ms: cfg.windowMs, hours: cfg.windowMs / 3_600_000 },
      config: this.publicConfig(),
      points: analyzed,
      summary: this.buildSummary(points, analyzed, cfg),
    };
  }

  // Just the latest point's verdict — used to enrich each broadcast without
  // shipping the whole series every cycle.
  async classifyLatest() {
    const cfg = this.coreConfig();
    const points = await this.repository.listForAnalysis(cfg.windowMs);
    if (points.length === 0) return null;
    const analyzed = analyzeSeries(points, cfg);
    return {
      latest: analyzed[analyzed.length - 1],
      summary: this.buildSummary(points, analyzed, cfg),
    };
  }

  buildSummary(points, analyzed, cfg) {
    const values = points.filter((p) => p.success && p.responseTimeMs !== null).map((p) => p.responseTimeMs);
    const currentMean = mean(values);
    const currentStd = stddev(values);

    // Fold the EWMA over the window to get the forecast for the *next* request.
    let level = null;
    for (const v of values) level = ewmaStep(level, v, cfg.alpha);

    const anomalies = analyzed.filter((p) => p.isAnomaly);
    const last = analyzed[analyzed.length - 1] || null;

    return {
      sampleCount: values.length,
      totalPoints: points.length,
      currentMean,
      currentStd,
      nextPredictedMs: level,
      upperBand: currentMean !== null && currentStd !== null ? currentMean + cfg.zThreshold * currentStd : null,
      lowerBand: currentMean !== null && currentStd !== null ? Math.max(0, currentMean - cfg.zThreshold * currentStd) : null,
      lastZScore: last ? last.zScore : null,
      anomalyCount: anomalies.length,
      warmingUp: values.length < cfg.minSamples,
      // Most recent anomalies first, capped — this is the "alerts" feed.
      alerts: anomalies
        .slice(-10)
        .reverse()
        .map((p) => ({
          id: p.id,
          requestedAt: p.requestedAt,
          responseTimeMs: p.responseTimeMs,
          reasons: p.reasons,
          zScore: p.zScore,
        })),
    };
  }

  publicConfig() {
    return {
      zThreshold: this.settings.zThreshold,
      ewmaAlpha: this.settings.ewmaAlpha,
      minSamples: this.settings.minSamples,
    };
  }
}

module.exports = { AnalysisService, analysisService: new AnalysisService() };
