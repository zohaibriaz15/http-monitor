-- Stores one row per monitor request/response cycle.
CREATE TABLE IF NOT EXISTS monitor_results (
  id              BIGSERIAL PRIMARY KEY,
  target_url      TEXT        NOT NULL,
  request_payload JSONB       NOT NULL,
  success         BOOLEAN     NOT NULL,
  status_code     INTEGER,
  response_time_ms INTEGER,
  response_body   JSONB,
  error_message   TEXT,
  requested_at    TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The history endpoint always orders by most-recent-first.
CREATE INDEX IF NOT EXISTS idx_monitor_results_requested_at
  ON monitor_results (requested_at DESC);
