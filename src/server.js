// src/server.js — DRiX-Brain HTTP service.
//
// Brain runs as a Railway service. Apps (Pitch, Campaign, etc) call its
// endpoints over Railway's internal network for FAST operations (cache,
// auth, TDE). Apps do NOT call brain for SLOW operations (LLM, web fetch) —
// they call OpenRouter / Firecrawl directly with their own credentials.
//
// Endpoints (all POST take JSON, all return JSON):
//   GET  /healthz
//   POST /cache/scrape/lookup    { url }                          → row | null
//   POST /cache/scrape/store     { url, fetched, fetched_via }    → { ok }
//   POST /cache/pitch/lookup     { inputs, reseller_id }          → row | null
//   POST /cache/pitch/store      { inputs, reseller_id, result }  → { cache_key }
//
// On startup: connects to Postgres (via brain's own db.js), runs idempotent
// schema init for the cache tables. If DATABASE_URL is missing the service
// still boots — endpoints return 503.

require('dotenv').config();

const express = require('express');
const db      = require('./db/db');
const cache   = require('./cache');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));

// ─── Cache init ────────────────────────────────────────────────────────────
let _cacheReady = false;
let _cacheInitPromise = null;
async function ensureCacheReady() {
  if (_cacheReady) return true;
  if (!db.isConfigured || !db.isConfigured()) return false;
  if (!_cacheInitPromise) {
    _cacheInitPromise = cache.init(db.getPool())
      .then(() => { _cacheReady = true; return true; })
      .catch(err => { _cacheInitPromise = null; console.error('[brain] cache init failed:', err.message); return false; });
  }
  return _cacheInitPromise;
}
// Best-effort eager init on boot, but never block startup.
ensureCacheReady();

// ─── Health ────────────────────────────────────────────────────────────────
app.get('/healthz', async (_req, res) => {
  const dbReady = !!(db.isConfigured && db.isConfigured());
  res.json({
    ok: true,
    service: 'drix-brain',
    version: require('../package.json').version,
    db_configured: dbReady,
    cache_ready: _cacheReady,
    port: PORT,
  });
});

// ─── Scrape cache ──────────────────────────────────────────────────────────
app.post('/cache/scrape/lookup', async (req, res) => {
  try {
    if (!(await ensureCacheReady())) return res.status(503).json({ error: 'cache not ready' });
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    const hit = await cache.scrape.lookup(db.getPool(), url);
    if (hit) cache.scrape.recordHit(db.getPool(), url); // fire and forget
    res.json(hit || null);
  } catch (e) {
    console.error('[scrape/lookup]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/cache/scrape/store', async (req, res) => {
  try {
    if (!(await ensureCacheReady())) return res.status(503).json({ error: 'cache not ready' });
    const { url, fetched, fetched_via } = req.body || {};
    if (!url || !fetched) return res.status(400).json({ error: 'url and fetched required' });
    await cache.scrape.store(db.getPool(), url, fetched, fetched_via);
    res.json({ ok: true });
  } catch (e) {
    console.error('[scrape/store]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Pitch cache (reseller-scoped) ─────────────────────────────────────────
app.post('/cache/pitch/lookup', async (req, res) => {
  try {
    if (!(await ensureCacheReady())) return res.status(503).json({ error: 'cache not ready' });
    const { inputs, reseller_id } = req.body || {};
    if (!inputs) return res.status(400).json({ error: 'inputs required' });
    const hit = await cache.pitch.lookup(db.getPool(), inputs, reseller_id || 'anonymous');
    if (hit) cache.pitch.recordHit(db.getPool(), hit.cache_key); // fire and forget
    res.json(hit || null);
  } catch (e) {
    console.error('[pitch/lookup]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/cache/pitch/store', async (req, res) => {
  try {
    if (!(await ensureCacheReady())) return res.status(503).json({ error: 'cache not ready' });
    const { inputs, reseller_id, result } = req.body || {};
    if (!inputs || !result) return res.status(400).json({ error: 'inputs and result required' });
    const cache_key = await cache.pitch.store(db.getPool(), inputs, reseller_id || 'anonymous', result);
    res.json({ ok: true, cache_key });
  } catch (e) {
    console.error('[pitch/store]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'not found', path: req.path }));

app.listen(PORT, () => {
  console.log(`[drix-brain] listening on http://localhost:${PORT}`);
  console.log(`[drix-brain] db_configured: ${!!(db.isConfigured && db.isConfigured())}`);
});
