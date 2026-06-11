# HTTP Monitor

A full-stack application that pings `httpbin.org/anything` on a schedule, stores each
request/response cycle in PostgreSQL, and streams new results to a live web dashboard.

```
┌────────────┐   every 5 min    ┌──────────────────────────┐
│ Scheduler  │ ───────────────► │  MonitorService          │
└────────────┘                  │  1. random JSON payload  │
                                 │  2. POST httpbin/anything│
                                 │  3. persist to Postgres  │──► monitor_results
                                 │  4. broadcast over WS    │
                                 └────────────┬─────────────┘
                                              │  { type: "monitor_result", data }
        REST (history/stats)                  ▼
   ┌──────────────────┐  HTTP   ┌──────────────────────────┐  WebSocket
   │  React dashboard │ ◄─────► │  Express API + ws server │ ◄───────────┐
   │  (Vite + TS)     │         └──────────────────────────┘             │
   └──────────────────┘  ◄──────────── live updates ─────────────────────┘
```

- **Backend:** Node.js + Express, PostgreSQL (`pg`), WebSocket (`ws`), `node-cron`.
- **Frontend:** React + TypeScript (Vite), Tailwind CSS, TanStack Query, Recharts.

---

## Repository layout

```
http-monitor/
├── backend/         # Express API, scheduler, WebSocket broadcaster, Postgres
└── frontend/        # React + TS dashboard (Vite, Tailwind, TanStack Query)
```

---

## Technology choices & reasoning

| Choice | Why |
|--------|-----|
| **Node.js + Express** | The workload is I/O-bound (an HTTP ping, a DB write, a socket push) — Node's event loop fits it well, and Express is the minimal, well-understood way to expose a few REST routes. |
| **PostgreSQL** | Relational integrity for the time-series of results, plus **`JSONB`** columns to store the random request payload and httpbin's response without a rigid schema. Its aggregate/window features make the stats and anomaly queries easy. |
| **`pg`** (no ORM) | One table — a query builder/ORM would be overhead. Hand-written parameterized SQL keeps it transparent and safe. |
| **`ws`** | A tiny, fast WebSocket server. Socket.IO's reconnection/room features aren't needed for a single broadcast channel. |
| **`node-cron`** | Declarative 5-minute schedule; readable and trivially configurable via env. |
| **Native `fetch` + `AbortController`** | Built into Node 18+ — first-class timeout handling, no `axios` dependency. |
| **React + Vite + TypeScript** | Fast SPA dev loop and type safety across the API boundary (frontend types mirror the backend payloads). |
| **Tailwind CSS** | Rapid, consistent responsive styling without a separate stylesheet to maintain. |
| **TanStack Query** | Owns the initial REST fetch + cache; the WebSocket merges live pushes into the same cache — no manual loading-state juggling. |
| **Recharts** | Declarative composed chart (range area + lines + scatter) — the cleanest fit for the confidence band, forecast, and anomaly markers. |
| **Jest + Supertest / ESLint / GitHub Actions** | Standard, low-friction testing, linting, and CI. |

---

## Running locally

### Prerequisites
- **Node.js ≥ 18** (uses the native `fetch` / `AbortController`)
- **PostgreSQL ≥ 13** running locally

### 1. Database
Create the development (and test) databases:
```bash
createdb http_monitor_development
createdb http_monitor_test          # only needed to run the backend tests
```
The default connection string is `postgresql://localhost:5432/http_monitor_development`.
If your Postgres needs a user/password, set `DATABASE_URL` in `backend/.env` (next step).

### 2. Backend  → http://localhost:4000
```bash
cd backend
cp .env.example .env        # adjust DATABASE_URL etc. if needed
npm install
npm run migrate             # creates the monitor_results table
npm start                   # or: npm run dev  (auto-reload via node --watch)
```
On boot it runs one monitor cycle immediately, then every 5 minutes.

### 3. Frontend  → http://localhost:5173
```bash
cd frontend
cp .env.example .env        # points at http://localhost:4000 by default
npm install
npm run dev
```
Open http://localhost:5173. You'll see existing history load, and new rows appear
live as the scheduler (or the **Run now** button) produces them.

> **Tip:** the dashboard's **Run now** button (and `POST /api/monitor/run`) triggers a
> cycle on demand so you don't have to wait 5 minutes to see real-time updates.

---

## API reference

Base URL: `http://localhost:4000`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/health` | Readiness probe — checks DB connectivity, scheduler, and WS client count. `200` healthy / `503` if the DB is unreachable. |
| `GET`  | `/api/results` | Paginated history, newest first. Query params: `limit` (1–100, default 25), `offset`, `success` (`true`/`false`), `sortBy` (`requested_at`/`status_code`/`response_time_ms`/`id`), `order` (`asc`/`desc`). Returns `{ items, total, limit, offset }`. |
| `GET`  | `/api/results/:id` | A single result, or `404`. |
| `GET`  | `/api/stats` | Aggregates: `{ total, successes, failures, avgResponseTimeMs, lastRequestedAt }`. |
| `GET`  | `/api/analysis` | Anomaly analysis over the rolling window: `{ window, config, points[], summary }` — per-point rolling mean/std, forecast, ±zσ band, and anomaly verdicts, plus a summary with the next-value forecast and recent alerts. |
| `POST` | `/api/monitor/run` | Manually trigger one monitor cycle (returns the saved record, `201`). |

**WebSocket:** `ws://localhost:4000/ws`
- On connect: `{ "type": "connected", "data": { "at": "<iso>" } }`
- On each new result: `{ "type": "monitor_result", "data": <MonitorResult + analysis>, "summary": <AnalysisSummary> }` — the `analysis` field is that point's anomaly verdict (rolling stats, forecast, band, z-score, `isAnomaly`, `reasons`).

---

## Anomaly detection (AI enhancement)

Intelligent monitoring that learns the normal response-time pattern and flags
deviations in real time. The signal analyzed is **`responseTimeMs`**.

### What it does
- **Rolling statistics** — mean & sample standard deviation over a configurable
  time window (default **24h**, 1h minimum), recomputed continuously.
- **Anomaly detection** — **z-score** against the *prior* window: a point is
  anomalous when `|z| > 3` (configurable). Equivalently, when it falls outside
  the **mean ± 3σ confidence band** — so the band on the chart literally *is* the
  decision boundary. Failed requests are flagged as their own anomaly type.
- **Forecasting** — **single exponential smoothing (EWMA)** predicts the next
  expected response time; the per-point forecast also drives a prediction-error
  signal (`|actual − predicted| / σ > threshold`).
- **Alerts** — fire on a failure, a z-score breach, or a prediction-error breach.
  They're logged server-side (`logger.warn`), pushed over the WebSocket, and
  surfaced in the dashboard's alerts feed.
- **Visualization** — a Recharts composed chart overlays: raw response times,
  the rolling mean, the predicted line, the ±zσ confidence band, and red anomaly
  markers — making normal vs. anomalous behavior obvious at a glance.

### Algorithm choices & trade-offs

| Choice | Why | Trade-off |
|--------|-----|-----------|
| **Z-score over a rolling window** | Simple, interpretable ("3σ rule"), and the threshold maps directly to a visual band. | Assumes roughly normal latencies; very skewed/multimodal distributions would be better served by robust stats (median/MAD) or an ML model. |
| **EWMA forecast** (single exponential smoothing) | O(1) per point, no training, naturally weights recent data — a pragmatic "simple time-series forecast". | Doesn't model trend or seasonality. Holt/Holt-Winters or ARIMA would capture those; overkill for a single latency series at 5-min cadence. |
| **Baseline from *successful* requests only** | A timeout (10s) would otherwise inflate σ and mask real spikes. | Failures are handled as a separate categorical anomaly instead of feeding the latency model. |
| **Judge each point against the *prior* window** | A point can't mask its own anomaly. | The very first `minSamples` points are "warming up" and not flagged (avoids false positives on cold start). |
| **Recompute, don't persist verdicts** | Stateless; thresholds can be re-tuned with zero migration/backfill. | A little recomputation per request — trivial at this scale (≤288 points, O(n)). |

### Efficiency (real-time, non-blocking)
- The windowed mean/std use an **O(n) two-pointer sweep** with running
  sum / sum-of-squares (evicting aged-out points) — no per-point re-scan.
- Heavy work stays **server-side**. Each broadcast carries the new point's
  precomputed verdict, so the **browser only appends one point (O(1))** to the
  chart — the UI thread never recomputes the series.

### Tuning (env vars)
`ANOMALY_WINDOW_HOURS` (24), `ANOMALY_Z_THRESHOLD` (3), `ANOMALY_EWMA_ALPHA`
(0.3), `ANOMALY_MIN_SAMPLES` (5). Lower the z-threshold for more sensitivity
(more false positives); raise α to react faster to recent shifts.

Core logic lives in [`anomalyDetector.js`](backend/src/services/anomalyDetector.js)
(pure, fully unit-tested) and [`analysisService.js`](backend/src/services/analysisService.js).

---

## Core components & why they exist

The design splits the monitor cycle into small, single-responsibility, **injectable** units.
That separation is what makes the system testable without a live network or database, and
it mirrors where the real risk lives.

| Component | Responsibility | Why it's a seam |
|-----------|----------------|-----------------|
| `services/monitorService.js` | The heart: build payload → POST → classify → persist → broadcast. Never throws on network/HTTP failure; a failure becomes a stored `success: false` row. | Takes `fetchImpl`, `repository`, `broadcaster` as constructor deps so it's unit-testable in isolation. |
| `services/scheduler.js` | Wraps `node-cron`; runs on boot, then every 5 min. Guards against overlapping ticks. | Schedule + run-on-boot are injectable; overlap guard prevents a slow request piling up behind the next tick. |
| `realtime/broadcaster.js` | Owns the `ws` server, fan-out, and a ping/pong heartbeat that drops dead sockets. | Broadcasting is best-effort and isolated, so a socket error can't break the monitor cycle. |
| `repositories/monitorRepository.js` | All SQL. Whitelisted sort columns, parameterized queries, capped page size. | The only module that touches the DB — a single place to reason about query safety. |
| `db/migrate.js` | Minimal forward-only migration runner (tracks applied files in `schema_migrations`). | Keeps schema setup in version control without pulling in a heavier migration tool. |
| `services/anomalyDetector.js` | Pure statistics: mean/std, z-score, EWMA, and the O(n) windowed `analyzeSeries`. | Side-effect-free → statistical correctness is trivially unit-testable. |
| `services/analysisService.js` | Bridges the detector to stored data: fetches the window, runs analysis, assembles the summary/forecast/alerts. | Single place that turns rows into the `/api/analysis` payload and real-time verdicts. |
| **Frontend** `hooks/useMonitorData.ts` | Fuses the REST snapshot (TanStack Query) with live WS pushes; merges into the query cache, bumps stats optimistically, reconciles from the server (debounced). | One place owns "what the dashboard knows," keeping components purely presentational. |
| **Frontend** `hooks/useWebSocket.ts` | Reusable socket with capped exponential-backoff reconnect; refetches on reconnect to backfill missed data. | Connection concerns isolated from data concerns. |

---

## Testing & CI

```bash
cd backend
npm test              # run the suite (52 tests)
npm run test:coverage # suite + coverage report (text + lcov in coverage/)
npm run lint          # ESLint
```

### Core components & the ones tested comprehensively

The two highest-risk parts of the system get comprehensive coverage:

- **`MonitorService`** — the monitor cycle (payload → request → classify → persist → broadcast),
  where the product lives and a regression is most damaging. Its tests pin down every branch:
  2xx success, 4xx/5xx, network error, timeout, empty / non-JSON bodies, per-request payload
  generation, correct headers, the `runOnce` persist + broadcast contract (DB-failure
  propagation, best-effort broadcast), and anomaly-enriched broadcasts.
- **`anomalyDetector`** — the statistical engine. Since "statistical correctness" is explicitly
  evaluated, its pure functions (mean, sample std, z-score, EWMA) and the windowed `analyzeSeries`
  are tested against crafted series: spikes, drops, failures, warm-up suppression, band ordering,
  and baseline integrity (timeouts excluded).

### Test categories (matching the three probable categories)

1. **Unit — critical business logic.**
   - `monitorService.test.js` — the comprehensive core-cycle suite described above.
   - `anomalyDetector.test.js` + `analysisService.test.js` — statistical correctness and the
     summary/forecast assembly.
   - `scheduler.test.js` — run-on-boot, the overlapping-tick guard, invalid-cron handling, and
     error-swallowing so the cron keeps ticking.
   - `payloadGenerator.test.js` — payload is well-shaped and varies across calls.
2. **Integration — key API endpoints.** `routes.test.js` drives the real Express app against a
   real Postgres test DB: pagination, the `success` filter, `404`/`400` shapes, `/stats`
   aggregation, `/analysis`, and the manual-trigger endpoint.
3. **Basic end-to-end — critical user flow.** `e2e/realtime.test.js` boots a real HTTP + WebSocket
   server, connects a live client, triggers `POST /api/monitor/run`, and asserts the result is
   **broadcast over the socket and persisted/queryable** — the real-time path that is the heart
   of the assignment. (This test caught a real shutdown bug in the broadcaster.)

52 tests in total. Coverage is concentrated on the highest-risk logic (services ~92–100%,
repository/routes ~95–100%) rather than chasing a global number; `server.js` is excluded as a
thin wiring entrypoint.

### CI pipeline (GitHub Actions — `.github/workflows/ci.yml`)

On every push to `main`/`master` and on every PR, the pipeline spins up a Postgres service
container and runs, in order: **lint → migrate → test with coverage**, then uploads the
coverage report as a build artifact.

> **Scope note:** comprehensive automated testing is focused on the backend, where the core
> business logic lives. The frontend is verified manually (responsive layouts, live updates,
> reconnect/backfill, error states) — see *Shortcuts* below.

---

## Assumptions & shortcuts

**Assumptions made (where the brief was intentionally vague):**
- **Database:** PostgreSQL, with `JSONB` columns for the request payload and the full httpbin
  response body — flexible storage without a rigid schema for the echoed data.
- **Failures are data.** A failed ping (timeout / network error / non-2xx) is stored as a row
  with `success: false` and an `error_message`, not discarded — a monitor that hides failures
  is useless.
- **Schedule = `node-cron` `*/5 * * * *`**, plus an immediate run on boot so there's data
  without waiting. The interval, target URL, and timeout are all env-configurable.
- **Stats:** average latency is computed over **successful** requests only (failed/timed-out
  latencies would skew it).
- **History size:** the dashboard keeps/loads the most recent 100 rows (the API caps page
  size at 100) to stay snappy and bounded; full history remains queryable via pagination.
- **No authentication.** Treated as an internal, single-tenant monitoring dashboard. CORS is
  `*` in development. Both would need tightening for a public deployment.
- A **manual-trigger endpoint** (`POST /api/monitor/run`) was added beyond the spec — it makes
  the real-time pipeline demonstrable in seconds instead of minutes.

**Shortcuts taken due to time constraints:**
- **Custom minimal migration runner** instead of a tool like Knex/`node-pg-migrate` — adequate
  for one table; a real app would use a dedicated tool.
- **No automated frontend tests.** The frontend was verified manually (responsive layouts at
  desktop/tablet/mobile, live WS updates, row-detail expansion, error states). Given more
  time I'd add Vitest + Testing Library around `useMonitorData`'s merge logic first.
- **In-process scheduler** (the API server also runs the cron). Fine here; at scale the
  monitor would be a separate worker so API restarts don't interrupt scheduling.
- **No rate-limiting / retry/backoff on the httpbin call** beyond a per-request timeout and the
  job's retry config.

---

## Deploying to Railway

The app deploys as **three Railway components in one project**: a PostgreSQL
database, the **backend** service, and the **frontend** service. Each service has
a `railway.json` (build + start + health check) and uses its own subdirectory as
the **Root Directory**.

### 1. Create the project + database
1. New Project → **Deploy from GitHub repo** (or `railway init` via CLI).
2. **+ New → Database → PostgreSQL.** This exposes `DATABASE_URL` for reference.

### 2. Backend service
- **Settings → Root Directory:** `backend`
- **Variables:**
  | Variable | Value |
  |----------|-------|
  | `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` (reference the DB service) |
  | `NODE_ENV` | `production` |
  | `CORS_ORIGIN` | the frontend's URL (set after step 3), e.g. `https://web-production-xxxx.up.railway.app` |
  | `DATABASE_SSL` | leave unset/`false` (private networking) — `true` only if you use the public DB URL |
- Build/start come from `backend/railway.json` (`npm start`). **Migrations run
  automatically on boot**, so no separate release step is needed. Health check:
  `/api/health` (stays "unhealthy" until the DB is reachable).
- Under **Settings → Networking**, generate a public domain.

### 3. Frontend service
- **+ New → GitHub repo** (same repo) → **Settings → Root Directory:** `frontend`
- **Variables** (Vite inlines these at **build** time, so set them *before* the build):
  | Variable | Value |
  |----------|-------|
  | `VITE_API_BASE` | the backend's public URL, e.g. `https://api-production-xxxx.up.railway.app` |
  | `VITE_WS_URL` | same host with `wss://` + `/ws`, e.g. `wss://api-production-xxxx.up.railway.app/ws` |
- ⚠️ **Do not set `NODE_ENV=production` here** — the build needs the devDependencies
  (Vite/Tailwind/TS). Build/start come from `frontend/railway.json`: `npm run build`
  then `npm start`, which serves the static `dist/` with [`serve`](https://www.npmjs.com/package/serve)
  (a real runtime dependency, so nothing breaks if dev deps are pruned).
- Generate a public domain, then go back and set the backend's `CORS_ORIGIN` to it.

### 4. Wire-up notes
- Use **`https://` / `wss://`** in production — a page served over HTTPS can't open a
  plaintext `ws://` socket.
- Redeploy the **frontend** whenever `VITE_API_BASE` / `VITE_WS_URL` change (they're
  baked into the bundle at build time).
- CLI alternative: `railway up` from each service directory after `railway link`.
