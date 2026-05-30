// src/cache/scrapeCache.js — GLOBAL URL → scraped content cache.
//
// Lookup is by exact URL match. 30-day freshness — if older, treat as miss.
// All resellers share this table; the content is public web data.
//
// Usage:
//   const cache = require('drix-brain/src/cache/scrapeCache');
//   const cached = await cache.lookup(pool, url);          // → row or null
//   await cache.store(pool, url, fetchedObj, 'firecrawl'); // upsert
//   await cache.recordHit(pool, url);                       // bump hit_count
//
// In practice, prefer the getOrFetch wrapper in the brain's public API.

const TTL_DAYS = parseInt(process.env.SCRAPE_CACHE_TTL_DAYS || '30', 10);

async function lookup(pool, url) {
  if (!pool || !url) return null;
  const sql = `
    SELECT url, title, description, text, fetched_via, byte_count, created_at, updated_at, hit_count
    FROM scrape_cache
    WHERE url = $1
      AND updated_at >= NOW() - ($2::TEXT || ' days')::INTERVAL
    LIMIT 1
  `;
  const r = await pool.query(sql, [url, String(TTL_DAYS)]);
  return r.rows[0] || null;
}

async function store(pool, url, fetched, fetchedVia) {
  if (!pool || !url || !fetched) return;
  const sql = `
    INSERT INTO scrape_cache (url, title, description, text, fetched_via, byte_count, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (url) DO UPDATE SET
      title        = EXCLUDED.title,
      description  = EXCLUDED.description,
      text         = EXCLUDED.text,
      fetched_via  = EXCLUDED.fetched_via,
      byte_count   = EXCLUDED.byte_count,
      updated_at   = NOW()
  `;
  await pool.query(sql, [
    url,
    fetched.title || null,
    fetched.description || null,
    fetched.text || null,
    fetchedVia || null,
    (fetched.text || '').length,
  ]);
}

async function recordHit(pool, url) {
  if (!pool || !url) return;
  await pool.query(
    'UPDATE scrape_cache SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE url = $1',
    [url]
  ).catch(() => {}); // non-fatal
}

module.exports = { lookup, store, recordHit, TTL_DAYS };
