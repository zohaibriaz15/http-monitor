'use strict';

const crypto = require('crypto');

const EVENT_TYPES = ['page_view', 'click', 'purchase', 'signup', 'heartbeat', 'error'];
const REGIONS = ['us-east', 'us-west', 'eu-central', 'ap-south', 'sa-east'];
const TAGS = ['alpha', 'beta', 'canary', 'stable', 'experimental', 'legacy'];

function randomInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function pickSome(arr, max) {
  const count = randomInt(0, Math.min(max, arr.length));
  const pool = [...arr];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const idx = randomInt(0, pool.length - 1);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// A random-but-consistently-shaped JSON payload for each request: same fields,
// different values every call.
function generatePayload() {
  return {
    id: crypto.randomUUID(),
    eventType: pick(EVENT_TYPES),
    sequence: randomInt(1, 1_000_000),
    region: pick(REGIONS),
    tags: pickSome(TAGS, 3),
    metrics: {
      value: Number((Math.random() * 1000).toFixed(2)),
      latencyMs: randomInt(1, 750),
      success: Math.random() > 0.2,
    },
    clientTimestamp: new Date().toISOString(),
  };
}

module.exports = { generatePayload };
