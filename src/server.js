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
//   POST /cache/hydration/lookup { inputs, selection_key }         → { cache_key, result } | null
//   POST /cache/hydration/store  { inputs, selection_key, result } → { cache_key }
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

// ─── HYDRATION CACHE (Cache 2) ───────────────────────────────────────────────
// Post-selection bundle (questions + emails + pain indicators) keyed on the
// pre-selection input hash PLUS the chosen selection (strategy id, or a derived
// top-pain angle for products that skip strategy selection). Reuses ingest_cache
// (role 'hydration') so it shares the 30-day TTL with the pre-selection caches.
app.post('/cache/hydration/lookup', async (req, res) => {
  try {
    const { inputs, selection_key } = req.body || {};
    const key = cache.pitch.hashPitchInputs(inputs) + ':' + (selection_key || 'default');
    const payload = await db.getCachedIngest(key, 'hydration');
    res.json(payload ? { cache_key: key, result: payload } : null);
  } catch (e) {
    console.error('[hydration/lookup]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/cache/hydration/store', async (req, res) => {
  try {
    const { inputs, selection_key, result } = req.body || {};
    const key = cache.pitch.hashPitchInputs(inputs) + ':' + (selection_key || 'default');
    await db.setCachedIngest(key, 'hydration', result);
    res.json({ ok: true, cache_key: key });
  } catch (e) {
    console.error('[hydration/store]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── MEETING INTELLIGENCE ───────────────────────────────────────────────────
// POST /intel/meeting  — Full Ready Leads pipeline. Cache-first, TDE-powered.
// POST /intel/scan     — Lightweight single-person scan.

const { analyzeReadyLeads, analyzeSingle } = require('./intel/meeting-analysis');

function meetingCacheKey(attendees, solution, meetingType) {
  const attendeeKey = attendees
    .map(a => `${(a.name || '').toLowerCase().trim()}|${(a.company || '').toLowerCase().trim()}|${(a.title || '').toLowerCase().trim()}`)
    .sort()
    .join('::');
  return `meeting:${attendeeKey}:${(solution || '').toLowerCase().trim()}:${meetingType || 'discovery'}`;
}

// Minimal TDE config — stores individual atoms in ingest_cache
const tdeConfig = {
  tdeAvailable: () => !!(db.isConfigured && db.isConfigured()),
  tdeRequest: async (method, path, body) => {
    if (method === 'POST' && path === '/ingest' && body?.collectionId && body?.input) {
      await db.setCachedIngest(body.collectionId, 'tde-atom', { content: body.input, title: body.opts?.title });
      return { ok: true };
    }
    return { ok: true };
  },
  warmTdeCacheAsync: () => {},
  urlToCollectionId: (url) => `url-${(url || 'unknown').replace(/[^a-z0-9]/gi, '-').substring(0, 60)}`,
};

app.post('/intel/meeting', async (req, res) => {
  try {
    const { attendees, solution, meetingType, company, industry, notes } = req.body || {};
    if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
      return res.status(400).json({ error: 'attendees array required (at least 1)' });
    }
    if (!solution) return res.status(400).json({ error: 'solution required' });
    if (attendees.length > 10) return res.status(400).json({ error: 'max 10 attendees' });

    // Check cache
    const cacheKey = meetingCacheKey(attendees, solution, meetingType);
    console.log(`[intel/meeting] Key: ${cacheKey}`);
    const cached = await db.getCachedIngest(cacheKey, 'meeting');
    if (cached) {
      console.log(`[intel/meeting] Cache HIT`);
      return res.json({ ...cached, _cached: true, _cache_key: cacheKey });
    }
    console.log(`[intel/meeting] Cache MISS — running pipeline`);

    const llmConfig = {
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      modelId: process.env.OPENROUTER_MODEL_ID || 'anthropic/claude-sonnet-4.5',
      cerebrasApiKey: process.env.CEREBRAS_API_KEY || null,
    };
    if (!llmConfig.openrouterApiKey) {
      return res.status(503).json({ error: 'OPENROUTER_API_KEY not configured' });
    }

    const context = {
      solution,
      company: company || attendees[0]?.company || 'Unknown',
      industry: industry || 'Unknown',
      meetingType: meetingType || 'discovery',
      notes: notes || null,
    };

    const result = await analyzeReadyLeads(attendees, context, tdeConfig, llmConfig);
    await db.setCachedIngest(cacheKey, 'meeting', result);
    console.log(`[intel/meeting] Done — ${result.pipelineTimeMs}ms, cached`);
    res.json({ ...result, _cached: false, _cache_key: cacheKey });
  } catch (e) {
    console.error('[intel/meeting]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/intel/scan', async (req, res) => {
  try {
    const attendee = req.body || {};
    if (!attendee.name && !attendee.email && !attendee.linkedin) {
      return res.status(400).json({ error: 'need at least name, email, or linkedin' });
    }
    const result = await analyzeSingle(attendee, tdeConfig);
    res.json(result);
  } catch (e) {
    console.error('[intel/scan]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'not found', path: req.path }));

app.listen(PORT, () => {
  console.log(`[drix-brain] listening on http://localhost:${PORT}`);
  console.log(`[drix-brain] db_configured: ${!!(db.isConfigured && db.isConfigured())}`);
});
