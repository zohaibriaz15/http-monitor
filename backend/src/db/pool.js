'use strict';

const { Pool } = require('pg');
const config = require('../config');
const logger = require('../logger');

// A single shared connection pool for the process. `pg` queues queries when all
// connections are busy, so this is safe to import everywhere.
const pool = new Pool({
  connectionString: config.databaseUrl,
  // Railway's private networking needs no SSL; set DATABASE_SSL=true when
  // connecting over a public/external endpoint that requires it.
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  // An idle client in the pool errored (e.g. DB restarted). Log instead of
  // letting the unhandled 'error' event crash the process.
  logger.error('Unexpected error on idle PostgreSQL client', err);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, close };
