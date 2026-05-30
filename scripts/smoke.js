// scripts/smoke.js — Minimal smoke test for the brain.
// Verifies that all modules load without crashing. Run with `npm run smoke`.
//
// This does NOT make real LLM / Firecrawl / DB calls — that requires
// credentials and a live target. Use it as a first guard against import
// regressions when reorganizing files.

const assert = require('assert');

(async () => {
  console.log('[smoke] Loading brain index...');
  const brain = require('../src/index');

  assert.strictEqual(typeof brain.callLLM, 'function', 'callLLM should be a function');
  assert.strictEqual(typeof brain.fetchAndStrip, 'function', 'fetchAndStrip should be a function');
  assert.strictEqual(typeof brain.firecrawlScrape, 'function', 'firecrawlScrape should be a function');
  assert.strictEqual(typeof brain.salvageJSON, 'function', 'salvageJSON should be a function');
  assert.strictEqual(typeof brain.repairStrategyResponse, 'function', 'repairStrategyResponse should be a function');
  assert.ok(brain.db, 'db module should be present');
  assert.ok(brain.companyIntel, 'companyIntel module should be present');
  assert.ok(brain.competitiveIntel, 'competitiveIntel module should be present');
  assert.ok(brain.individualScan, 'individualScan module should be present');
  assert.ok(brain.meetingAnalysis, 'meetingAnalysis module should be present');
  assert.ok(brain.osintEnrichment, 'osintEnrichment module should be present');

  // salvageJSON pure-function sanity check
  const salvaged = brain.salvageJSON('{"a":1,"b":[1,2,3');
  assert.deepStrictEqual(salvaged, { a: 1, b: [1, 2, 3] }, 'salvageJSON should close brackets');

  console.log('[smoke] OK — all brain modules loaded and basic invariants hold.');
})().catch((err) => {
  console.error('[smoke] FAIL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
