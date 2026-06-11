# HTTP Monitor

**Live demo:** https://frontend-production-2533.up.railway.app

Pings `httpbin.org/anything` on a schedule, stores results in PostgreSQL, and streams live updates to a React dashboard.

**Every 5 minutes:**
1. `Scheduler` triggers `MonitorService`
2. `MonitorService` pings httpbin, saves result to `PostgreSQL`, and pushes the update over `WebSocket`
3. `React Dashboard` receives the live push instantly via WebSocket

**On page load / pagination:**
- `React Dashboard` fetches existing records from `PostgreSQL` via `REST API`

---

## Setup

### Docker (recommended)
```bash
docker compose up --build
```
Open http://localhost:5173. That's it — Postgres, backend, and frontend all start together.

### Manual
**Prerequisites:** Node.js ≥ 20, PostgreSQL running locally

```bash
# Database
createdb http_monitor_development

# Backend → http://localhost:4000
cd backend && cp .env.example .env && npm install && npm run migrate && npm run dev

# Frontend → http://localhost:5173
cd frontend && cp .env.example .env && npm install && npm run dev
```

---

## Tech choices

| | Why |
|---|---|
| **Node.js + Express** | I/O-bound workload — one HTTP ping, one DB write, one socket push. Minimal overhead. |
| **PostgreSQL** | Time-series rows + JSONB for the echoed payload. No ORM — one table doesn't need one. |
| **`ws`** | Lightweight single-channel broadcast. Socket.IO's extras aren't needed here. |
| **`node-cron`** | Declarative schedule, env-configurable. |
| **React + Vite + TypeScript** | Fast dev loop, type safety across the API boundary. |
| **TanStack Query** | Owns the REST fetch/cache; WebSocket pushes merge into the same cache. |
| **Tailwind + Recharts** | Fast styling and a composed chart for the anomaly confidence band. |

---

## Architecture

- **MonitorService** — builds a random payload, POSTs to httpbin, persists the result, broadcasts over WebSocket. Failures are stored as `success: false` rows, not discarded.
- **AnomalyDetector** — rolling z-score + EWMA forecast flags unusual latency spikes. Pure functions, fully unit-tested.
- **Broadcaster** — fan-out WebSocket server with ping/pong heartbeat. Isolated so a socket error can't break the monitor cycle.
- **Repository** — all SQL in one place. Parameterized queries, whitelisted sort columns.
- **`useMonitorData`** (frontend) — fuses REST snapshot with live WS pushes into a single cache. Components stay purely presentational.

---

## Testing

```bash
cd backend && npm test          # 52 tests
npm run test:coverage           # + coverage report
npm run lint
```

**Core components tested comprehensively:**

- `monitorService` — the full monitor cycle: success, 4xx/5xx, timeout, network error, broadcast contract
- `anomalyDetector` — statistical correctness: spikes, drops, warm-up suppression, band ordering

**Test categories:**
- **Unit** — MonitorService, AnomalyDetector, AnalysisService, Scheduler, PayloadGenerator
- **Integration** — all REST endpoints against a real Postgres test DB
- **E2E** — boots a real server, triggers a run, asserts the result is broadcast over WebSocket and queryable via REST

**CI** (GitHub Actions) — runs on every push and PR: lint → migrate → test with coverage → upload coverage artifact.

---

## Deploying to Railway

Railway runs each service independently. You'll need three services: **Postgres** (managed), **backend**, and **frontend**.

### 1. Postgres
Add a Railway Postgres plugin — it auto-injects `DATABASE_URL`.

### 2. Backend service
- **Root Directory:** `backend`
- **Builder:** Dockerfile (auto-detected via `railway.json`)
- **Environment variables:**
  ```
  NODE_ENV=production
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  CORS_ORIGIN=<your-frontend-railway-url>
  MONITOR_RUN_ON_BOOT=true
  ```
- Migrations run automatically on boot. Health check hits `/api/health`.

### 3. Frontend service
- **Root Directory:** `frontend`
- **Builder:** Dockerfile (auto-detected via `railway.json`)
- **Environment variables** (baked into the bundle at build time):
  ```
  VITE_API_BASE=https://<your-backend-railway-url>
  VITE_WS_URL=wss://<your-backend-railway-url>/ws
  ```
  > Use `https://` and `wss://` — Railway serves over TLS.
- Redeploy the frontend whenever these values change.

---

## Assumptions

- Failed pings are stored as data, not dropped
- Stats (avg latency) computed over successful requests only
- No authentication — internal single-tenant tool
- Manual trigger endpoint (`POST /api/monitor/run`) added to demo real-time flow without waiting 5 minutes

---

## Future improvements

- Frontend tests (Vitest + Testing Library for `useMonitorData`)
- Separate scheduler worker so API restarts don't interrupt the cron
- Rate limiting and auth for public deployments
- Proper migration tool (Knex / node-pg-migrate) instead of the minimal custom runner
