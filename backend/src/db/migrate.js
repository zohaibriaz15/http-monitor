'use strict';

const fs = require('fs');
const path = require('path');
const { pool, close } = require('./pool');
const logger = require('../logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// A deliberately minimal migration runner: applies every .sql file in
// migrations/ that hasn't been recorded yet, in filename order. Each file runs
// inside a transaction. This is plenty for a project this size; a real app
// would reach for node-pg-migrate or Knex migrations.
async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedMigrations() {
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

async function runMigrations() {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info(`Applied migration: ${file}`);
      count += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }

  if (count === 0) logger.info('No pending migrations.');
  return count;
}

// Allow `require()` from tests as well as `node src/db/migrate.js` from CLI.
if (require.main === module) {
  runMigrations()
    .then(() => close())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error(err.message);
      close().finally(() => process.exit(1));
    });
}

module.exports = { runMigrations };
