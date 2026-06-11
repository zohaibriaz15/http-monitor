// Centralized runtime config. Values come from Vite env vars (see .env), with
// localhost defaults so the app runs out of the box against a local backend.
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000/ws';

// Max rows to keep in the table / fetch on load. The backend caps page size at
// 100; we mirror that so the table stays snappy and memory stays bounded.
export const MAX_ROWS = 100;
export const PAGE_SIZE = 25;

// Max analysis points kept on the chart (24h @ 5-min cadence ≈ 288).
export const MAX_ANALYSIS_POINTS = 500;
