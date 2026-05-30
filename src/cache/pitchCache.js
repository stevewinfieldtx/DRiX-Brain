// src/cache/pitchCache.js — RESELLER-SCOPED full-pitch result cache.
//
// Key = SHA-256(canonical(inputs)). Inputs include reseller_context, so a
// different reseller hitting the same customer URL produces a different key
// and never sees another reseller's cached pitch.
//
// 30-day TTL by default.

const { hashPitchInputs } = require('./hash');

const TTL_DAYS = parseInt(process.env.PITCH_CACHE_TTL_DAYS || '30', 10);

async function lookup(pool, inputs, resellerId) {
  if (!pool) return null;
  const cache_key = hashPitchInputs(inputs);
  const sql = `
    SELECT cache_key, reseller_id, customer_url, solution_url, result,
           created_at, hit_count,
           EXTRACT(EPOCH FROM (NOW() - created_at))::INTEGER AS age_seconds
    FROM pitch_cache
    WHERE cache_key = $1
      AND reseller_id = $2
      AND created_at >= NOW() - ($3::TEXT || ' days')::INTERVAL
    LIMIT 1
  `;
  const r = await pool.query(sql, [cache_key, resellerId || 'anonymous', String(TTL_DAYS)]);
  return r.rows[0] || null;
}

async function store(pool, inputs, resellerId, result) {
  if (!pool || !result) return null;
  const cache_key = hashPitchInputs(inputs);
  const sql = `
    INSERT INTO pitch_cache (cache_key, reseller_id, customer_url, solution_url, result, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (cache_key) DO UPDATE SET
      result = EXCLUDED.result,
      created_at = NOW(),
      hit_count = 0,
      last_hit_at = NULL
  `;
  await pool.query(sql, [
    cache_key,
    resellerId || 'anonymous',
    inputs?.customer?.url || null,
    inputs?.solution?.url || null,
    result,
  ]);
  return cache_key;
}

async function recordHit(pool, cache_key) {
  if (!pool || !cache_key) return;
  await pool.query(
    'UPDATE pitch_cache SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE cache_key = $1',
    [cache_key]
  ).catch(() => {});
}

module.exports = { lookup, store, recordHit, hashPitchInputs, TTL_DAYS };
