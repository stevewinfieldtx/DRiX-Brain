# MANIFEST — DRiX-Brain provenance

Every file in this folder, where it came from, and how it was changed. Update this whenever you copy, reconcile, or rewrite something.

**Source repo:** `C:\Users\SteveWinfiel_12vs805\Documents\DRiX-Ready-Leads-v2`
**Initial copy date:** 2026-05-30

---

## Files copied verbatim (no edits)

| Brain path | Source path | Notes |
|---|---|---|
| `src/db/db.js` | `db.js` | Postgres pool + schema helpers. Used by every intel module. |
| `src/intel/company-intel.js` | `company-intel.js` | `enrichCompany`, `extractDomain`. |
| `src/intel/competitive-intel.js` | `competitive-intel.js` | `discoverCompetitors`. |
| `src/intel/individual-scan.js` | `individual-scan.js` | `scanIndividual` — deep psychographic scan. |
| `src/intel/meeting-analysis.js` | `meeting-analysis.js` | `analyzeSingle`, `analyzeGroup`, `analyzeReadyLeads`. |
| `src/intel/osint-enrichment.js` | `osint-enrichment.js` | OSINT lookups. |

If any of these are edited in the source repo while it's still live, the same edit must be replayed here. (Or vice versa once cutover starts.)

## Files extracted with minor reshaping

| Brain path | Source location | What changed |
|---|---|---|
| `src/llm/callLLM.js` | `server.js` lines 367–483 | Hoisted `callLLM`, `salvageJSON`, `repairStrategyResponse` into a standalone CommonJS module. Wrapped env reads in `require('dotenv').config()`. Changed `X-Title` header from `"TDE Demo v3"` to `"DRiX Brain"`. No behavior change. |
| `src/fetch/fetchAndStrip.js` | `server.js` lines 485–611 | Hoisted `fetchAndStrip` and its private helper `firecrawlScrape`. Changed User-Agent from `TDEDemo/3.0` to `DRiXBrain/1.0`. No behavior change. |
| `src/intel/pain-intel.js` | `server.js` `PAIN_PROMPT` + `extractPainPoints()` | Extracted verbatim prompt + pure generator. Dropped the in-function memory/Postgres caching (now the caller's concern, matching `company-intel`). Output shape unchanged: `{company_pain, subindustry_pain, industry_pain}`, each pain with `persona_primary`/`persona_secondary`. |
| `src/intel/strategy-intel.js` | `server.js` `STRATEGIES_PROMPT`, `STRATEGIES_PROMPT_AI_OPPS` + demo-flow cascade | Extracted verbatim prompts + `generateStrategies()` with the same 3-attempt cascade (primary / primary-large / claude fallback), `hasValidStrategies`, and `repairStrategyResponse`. Dropped caching (caller's concern). |
| `src/intel/discovery-intel.js` | `server.js` `DISCOVERY_INTEL_PROMPT` + `generateDiscoveryIntel()` | Extracted verbatim prompt + pure generator. One pass yields `{score, whoIsThis, primaryLead, painIndicators, questions, emailCampaign}` anchored on a chosen persona×pain angle. This is the canonical 'questions' format + creation. |

## Files created new (not in source)

| Brain path | Purpose |
|---|---|
| `package.json` | Minimal manifest with only the deps the brain actually uses (`dotenv`, `pg`). |
| `.env.example` | Inventory of env vars the brain reads. Superset of vars used by the modules above. |
| `.gitignore` | Standard. |
| `README.md` | Orientation for anyone opening this folder. |
| `MANIFEST.md` | This file. |
| `src/index.js` | Single public entrypoint re-exporting everything. |
| `scripts/smoke.js` | Verifies all modules load and a couple of pure functions behave correctly. |

## NOT copied (and why) — see also README

- `server.js` — god file. Brain is not an Express app.
- `ai-opps-routes.js`, `cross-sell-routes.js`, `mentor-match-routes.js` — product-specific.
- `public/*.html`, `client/` — front-end.
- `seed-*.json`, `benchmark_*`, `drix_pilot_study.js`, `fix_render.py` — demo/script files.
- Prompts inside `server.js` — TRIAGE IN PROGRESS. Shared generators extracted: `PAIN_PROMPT`→`pain-intel.js`, `STRATEGIES_PROMPT`(+AI_OPPS)→`strategy-intel.js`. Still in the god file and NOT yet extracted (product-specific or pending): the atomization/ingest prompts, individual-scan prompts, and any Leads-v2-only routing prompts.

---

## Drift log

Record every time you change a copied file or have to reconcile back to the source. Empty for now.

| Date | File | Change | Reason |
|---|---|---|---|
| 2026-06-09 | `src/intel/pain-intel.js` | Created — extracted `PAIN_PROMPT` + `extractPainPoints` from Leads-v2 `server.js`. | Shared pain generator belongs in the brain (single source of truth). Leads-v2 still has the inline copy until its cutover. |
| 2026-06-09 | `src/intel/strategy-intel.js` | Created — extracted `STRATEGIES_PROMPT`/`_AI_OPPS` + `generateStrategies` cascade. | Shared strategy generator belongs in the brain. Leads-v2 cutover pending. |
| 2026-06-09 | `src/index.js`, `package.json` | Exposed `painIntel`/`strategyIntel`; version 0.1.0 → 0.3.0. | Make the new generators consumable; signal a new release for tag-based dependents (Pitch). |
| 2026-06-09 | `src/intel/discovery-intel.js`, `src/index.js`, `package.json` | Created discovery-intel; exposed `discoveryIntel`; version 0.3.0 → 0.4.0. | Discovery-questions format + creation centralized in the brain (shared by Pitch + Leads-v2). |
| 2026-06-09 | (pending) `DRiX-Ready-Leads-v2/server.js` | NOT yet cut over to consume the brain modules — it still has the inline `PAIN_PROMPT`/`STRATEGIES_PROMPT` + generators. | Cutover deferred to avoid destabilizing the live god file; do it deliberately with testing. Until then, brain copy = canonical; replay any prompt edits in BOTH places. |
