// src/cache/hash.js — deterministic SHA-256 hashes for cache keys.
//
// canonicalJson() walks an object and emits a STABLE string regardless of
// key ordering. Same data → same hash. Skips undefined, sorts keys.

const crypto = require('crypto');

function canonicalJson(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (typeof v === 'object') {
    const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  }
  return JSON.stringify(String(v));
}

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

// Hash for the scrape cache — URL only.
function hashUrl(url) {
  return sha256(String(url || '').trim().toLowerCase());
}

// Hash for the pitch cache — full input payload.
// IMPORTANT: include reseller_context so each reseller gets its own cache.
function hashPitchInputs(inputs) {
  return sha256(canonicalJson(inputs));
}

module.exports = { canonicalJson, sha256, hashUrl, hashPitchInputs };
