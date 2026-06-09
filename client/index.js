// client/index.js — Thin HTTP client for brain.
//
// Apps install drix-brain and require this sub-path:
//   const brainClient = require('drix-brain/client');
//   await brainClient.cache.scrape.lookup(url);
//
// All methods are async, return parsed JSON (or null), throw on HTTP error.
// Reads BRAIN_URL from env. Defaults to http://localhost:3001 for local dev.

const BRAIN_URL_RAW = process.env.BRAIN_URL || 'http://localhost:3001';
const BRAIN_URL     = BRAIN_URL_RAW.replace(/\/+$/, '');
const TIMEOUT_MS    = parseInt(process.env.BRAIN_TIMEOUT_MS || '10000', 10);

async function post(path, body) {
  const r = await fetch(BRAIN_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const txt = await r.text();
  if (!r.ok) {
    throw new Error(`brain ${path} → ${r.status}: ${txt.slice(0, 300)}`);
  }
  try { return JSON.parse(txt); } catch { return txt; }
}

async function get(path) {
  const r = await fetch(BRAIN_URL + path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`brain ${path} → ${r.status}`);
  return r.json();
}

module.exports = {
  url: BRAIN_URL,
  health: () => get('/healthz'),
  cache: {
    scrape: {
      lookup: (url)                            => post('/cache/scrape/lookup', { url }),
      store:  (url, fetched, fetched_via)      => post('/cache/scrape/store',  { url, fetched, fetched_via }),
    },
    pitch: {
      lookup: (inputs, reseller_id)            => post('/cache/pitch/lookup',  { inputs, reseller_id }),
      store:  (inputs, reseller_id, result)    => post('/cache/pitch/store',   { inputs, reseller_id, result }),
    },
    hydration: {
      lookup: (inputs, selection_key)          => post('/cache/hydration/lookup', { inputs, selection_key }),
      store:  (inputs, selection_key, result)  => post('/cache/hydration/store',  { inputs, selection_key, result }),
    },
  },
};
