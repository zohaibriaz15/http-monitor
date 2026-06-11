'use strict';

const config = require('../config');
const logger = require('../logger');
const defaultRepository = require('../repositories/monitorRepository');
const { generatePayload } = require('./payloadGenerator');

// One monitor cycle: build a payload, POST it, classify the response, persist,
// and broadcast. Deps are injected (with defaults) so it's testable offline.
class MonitorService {
  constructor({
    repository = defaultRepository,
    broadcaster = null,
    analysisService = null,
    fetchImpl = globalThis.fetch,
    payloadFactory = generatePayload,
    targetUrl = config.monitor.targetUrl,
    timeoutMs = config.monitor.requestTimeoutMs,
  } = {}) {
    this.repository = repository;
    this.broadcaster = broadcaster;
    this.analysisService = analysisService;
    this.fetchImpl = fetchImpl;
    this.payloadFactory = payloadFactory;
    this.targetUrl = targetUrl;
    this.timeoutMs = timeoutMs;
  }

  // Returns a result object; never throws. Network/HTTP failures come back as
  // success=false so they get stored like any other outcome.
  async performRequest() {
    const requestedAt = new Date();
    const payload = this.payloadFactory();
    const startedAt = process.hrtime.bigint();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseTimeMs = elapsedMs(startedAt);
      const responseBody = await safeParseBody(response);

      return {
        targetUrl: this.targetUrl,
        requestPayload: payload,
        success: response.ok,
        statusCode: response.status,
        responseTimeMs,
        responseBody,
        errorMessage: response.ok ? null : `HTTP ${response.status} ${response.statusText}`.trim(),
        requestedAt,
      };
    } catch (err) {
      const responseTimeMs = elapsedMs(startedAt);
      const isTimeout = err.name === 'AbortError';
      return {
        targetUrl: this.targetUrl,
        requestPayload: payload,
        success: false,
        statusCode: null,
        responseTimeMs,
        responseBody: null,
        errorMessage: isTimeout
          ? `Request timed out after ${this.timeoutMs}ms`
          : `Request failed: ${err.message}`,
        requestedAt,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async runOnce() {
    const result = await this.performRequest();

    let saved;
    try {
      saved = await this.repository.insertResult(result);
    } catch (err) {
      // Let the caller decide: the scheduler logs and moves on, the route 500s.
      logger.error('Failed to persist monitor result', err);
      throw err;
    }

    if (result.success) {
      logger.info(`Monitor OK (${result.statusCode}) in ${result.responseTimeMs}ms — id=${saved.id}`);
    } else {
      logger.warn(`Monitor FAIL — ${result.errorMessage} — id=${saved.id}`);
    }

    const { analysis, summary } = await this.runAnomalyAnalysis(saved);
    this.broadcast(saved, analysis, summary);
    return saved;
  }

  // Classify the just-saved point so the broadcast can carry its anomaly
  // verdict. Best-effort — a failure here mustn't break the cycle.
  async runAnomalyAnalysis(saved) {
    if (!this.analysisService) return { analysis: null, summary: null };
    try {
      const res = await this.analysisService.classifyLatest();
      const analysis = res ? res.latest : null;
      if (analysis && analysis.isAnomaly) {
        const z = analysis.zScore != null ? analysis.zScore.toFixed(2) : 'n/a';
        logger.warn(`[anomaly] id=${saved.id} reasons=${analysis.reasons.join(',')} z=${z}`);
      }
      return { analysis, summary: res ? res.summary : null };
    } catch (err) {
      logger.error('Anomaly analysis failed (continuing)', err.message);
      return { analysis: null, summary: null };
    }
  }

  broadcast(record, analysis = null, summary = null) {
    if (!this.broadcaster) return;
    try {
      // Keep the message shape unchanged when no detector is wired in.
      const data = this.analysisService ? { ...record, analysis } : record;
      const message = { type: 'monitor_result', data };
      if (summary) message.summary = summary;
      this.broadcaster.broadcast(message);
    } catch (err) {
      logger.error('Failed to broadcast monitor result', err);
    }
  }
}

function elapsedMs(startedAt) {
  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}

// httpbin returns JSON, but fall back to wrapped raw text so the JSONB column
// always gets valid JSON.
async function safeParseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 10000) };
  }
}

module.exports = { MonitorService };
