// src/cache/schema.js — Postgres schema for the two cache tables.
//
// scrape_cache  — GLOBAL across all resellers. Keyed on URL only.
//                  Anyone who fetches example.com hits the same row.
//                  Public web content, no privacy issue sharing.
//
// pitch_cache   — RESELLER-SCOPED. Keyed on a SHA-256 hash of the full
//                  inputs payload (which includes reseller_context).
//                  Two resellers asking about the same customer get
//                  different hashes (different reseller_context),
//                  so they never see each other's pitch output.
//
// init() is idempotent — safe to call on every cold start. Uses
// "CREATE TABLE IF NOT EXISTS" so no migrations machinery needed yet.

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS scrape_cache (
  url             TEXT PRIMARY KEY,
  title           TEXT,
  description     TEXT,
  text            TEXT,
  fetched_via     TEXT,         -- 'firecrawl' | 'fetch'
  byte_count      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count       INTEGER NOT NULL DEFAULT 0,
  last_hit_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_scrape_cache_updated ON scrape_cache (updated_at);

CREATE TABLE IF NOT EXISTS pitch_cache (
  cache_key       TEXT PRIMARY KEY,      -- SHA-256 of canonical input JSON
  reseller_id     TEXT NOT NULL,         -- redundant with hash but useful for purge-by-reseller
  customer_url    TEXT,                  -- for human debugging only
  solution_url    TEXT,
  result          JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count       INTEGER NOT NULL DEFAULT 0,
  last_hit_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pitch_cache_reseller ON pitch_cache (reseller_id);
CREATE INDEX IF NOT EXISTS idx_pitch_cache_created  ON pitch_cache (created_at);
`;

let _initPromise = null;

async function init(pool) {
  if (_initPromise) return _initPromise;
  _initPromise = pool.query(SCHEMA_SQL)
    .then(() => { console.log('[brain.cache] schema ready'); })
    .catch(err => {
      _initPromise = null; // allow retry on next call
      throw err;
    });
  return _initPromise;
}

module.exports = { init, SCHEMA_SQL };
