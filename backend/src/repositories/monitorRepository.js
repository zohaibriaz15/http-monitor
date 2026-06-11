'use strict';

const db = require('../db/pool');

// Whitelisted sort columns so the API can't be coerced into ordering by an
// arbitrary / non-indexed column via query params.
const SORTABLE_COLUMNS = new Set(['requested_at', 'status_code', 'response_time_ms', 'id']);

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    targetUrl: row.target_url,
    requestPayload: row.request_payload,
    success: row.success,
    statusCode: row.status_code,
    responseTimeMs: row.response_time_ms,
    responseBody: row.response_body,
    errorMessage: row.error_message,
    requestedAt: row.requested_at,
    createdAt: row.created_at,
  };
}

async function insertResult(result) {
  const text = `
    INSERT INTO monitor_results
      (target_url, request_payload, success, status_code, response_time_ms, response_body, error_message, requested_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;
  const params = [
    result.targetUrl,
    result.requestPayload,
    result.success,
    result.statusCode ?? null,
    result.responseTimeMs ?? null,
    result.responseBody ?? null,
    result.errorMessage ?? null,
    result.requestedAt,
  ];
  const { rows } = await db.query(text, params);
  return mapRow(rows[0]);
}

// Newest-first listing with limit/offset paging and an optional success filter.
async function listResults({ limit = 25, offset = 0, success, sortBy = 'requested_at', order = 'desc' } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const sortColumn = SORTABLE_COLUMNS.has(sortBy) ? sortBy : 'requested_at';
  const sortOrder = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const where = [];
  const params = [];
  if (typeof success === 'boolean') {
    params.push(success);
    where.push(`success = $${params.length}`);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalQuery = `SELECT COUNT(*)::int AS count FROM monitor_results ${whereClause}`;
  const { rows: totalRows } = await db.query(totalQuery, params);

  const listParams = params.slice();
  listParams.push(safeLimit, safeOffset);
  const listQuery = `
    SELECT * FROM monitor_results
    ${whereClause}
    ORDER BY ${sortColumn} ${sortOrder}, id ${sortOrder}
    LIMIT $${listParams.length - 1} OFFSET $${listParams.length};
  `;
  const { rows } = await db.query(listQuery, listParams);

  return {
    items: rows.map(mapRow),
    total: totalRows[0].count,
    limit: safeLimit,
    offset: safeOffset,
  };
}

async function findById(id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const { rows } = await db.query('SELECT * FROM monitor_results WHERE id = $1', [numericId]);
  return mapRow(rows[0]);
}

// Lightweight aggregate stats for dashboards.
async function getStats() {
  const { rows } = await db.query(`
    SELECT
      COUNT(*)::int                                          AS total,
      COUNT(*) FILTER (WHERE success)::int                   AS successes,
      COUNT(*) FILTER (WHERE NOT success)::int               AS failures,
      ROUND(AVG(response_time_ms) FILTER (WHERE success))::int AS avg_response_time_ms,
      MAX(requested_at)                                      AS last_requested_at
    FROM monitor_results;
  `);
  const r = rows[0];
  return {
    total: r.total,
    successes: r.successes,
    failures: r.failures,
    avgResponseTimeMs: r.avg_response_time_ms,
    lastRequestedAt: r.last_requested_at,
  };
}

// Ascending-by-time points within the rolling window, for anomaly analysis.
// Selects only the columns the detector needs (keeps JSONB payloads out of
// memory) and caps the row count as a safety valve.
async function listForAnalysis(windowMs, { maxPoints = 5000 } = {}) {
  const since = new Date(Date.now() - windowMs);
  const { rows } = await db.query(
    `SELECT id, requested_at, response_time_ms, success, status_code
       FROM monitor_results
      WHERE requested_at >= $1
      ORDER BY requested_at ASC, id ASC
      LIMIT $2`,
    [since, maxPoints]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    requestedAt: r.requested_at,
    responseTimeMs: r.response_time_ms,
    success: r.success,
    statusCode: r.status_code,
  }));
}

// Test helper only.
async function deleteAll() {
  await db.query('TRUNCATE monitor_results RESTART IDENTITY');
}

module.exports = { insertResult, listResults, findById, getStats, listForAnalysis, deleteAll };
