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
- Prompts inside `server.js` — TBD; some are shared, some are product-specific. Triage in a follow-up pass.

---

## Drift log

Record every time you change a copied file or have to reconcile back to the source. Empty for now.

| Date | File | Change | Reason |
|---|---|---|---|
| — | — | — | — |
