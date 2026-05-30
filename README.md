# DRiX-Brain

Shared core for all DRiX / ReadyLead products. This is the **brain** — every product app (Enterprise Leads, SMB Leads, AI Opps, Cross-Sell, Mentor Match, etc.) should eventually call into here instead of duplicating logic or `require()`ing across repos.

**Status: scaffold.** Files copied from `DRiX-Ready-Leads-v2` on 2026-05-30. The original repo is **untouched** and still serves all live traffic. This folder exists so we can stand up the brain incrementally without breaking what works.

---

## What's here

```
DRiX-Brain/
├── package.json              Minimal — only deps the brain actually uses
├── .env.example              All env vars the brain modules expect
├── .gitignore
├── README.md                 This file
├── MANIFEST.md               Provenance: what was copied from where
├── scripts/
│   └── smoke.js              `npm run smoke` — verifies modules load
└── src/
    ├── index.js              Public entrypoint — re-exports everything
    ├── llm/
    │   └── callLLM.js        OpenRouter wrapper (+ JSON salvage, repair)
    ├── fetch/
    │   └── fetchAndStrip.js  URL → clean text (Firecrawl + fallback)
    ├── db/
    │   └── db.js             Postgres pool + schema helpers (copied verbatim)
    └── intel/
        ├── company-intel.js
        ├── competitive-intel.js
        ├── individual-scan.js
        ├── meeting-analysis.js
        └── osint-enrichment.js
```

## What was deliberately NOT copied

These live in the original repo and stay there for now:

| Not copied | Why |
|---|---|
| `server.js` | God file. The brain is **not** an Express app. Each product app will own its own Express server and import from the brain. |
| `ai-opps-routes.js`, `cross-sell-routes.js`, `mentor-match-routes.js` | Product-specific. These become their own product apps in phase 3 of the separation plan. |
| `public/*.html`, `client/` | Front-end. Belongs to product apps. |
| `seed-*.json` | Demo seed data. Belongs to whichever product needs it (probably Enterprise Leads). |
| `benchmark_*`, `drix_pilot_study.js`, `fix_render.py` | One-off scripts. Not part of the brain. |
| Prompts inside `server.js` (`INGEST_PROMPT`, `STRATEGIES_PROMPT`, `SMB_PROMPT`, etc.) | TBD — some are clearly product-specific (e.g. `SMB_PROMPT`), some are core (e.g. `INGEST_PROMPT`). Sorting them is a follow-up. |

---

## Quick start

```bash
cd C:\Users\SteveWinfiel_12vs805\Documents\DRiX-Brain
npm install
cp .env.example .env       # fill in OPENROUTER_API_KEY, DATABASE_URL
npm run check              # syntax-check every module
npm run smoke              # import-check (no live API calls)
```

If `npm run smoke` passes, the brain is internally consistent. You can then `require('drix-brain')` from anywhere.

---

## How a product app will use it (target shape)

```js
// products/cross-sell/server.js (future)
const express = require('express');
const { callLLM, fetchAndStrip, db } = require('drix-brain');
// ...or pin to a specific module:
const { fetchAndStrip } = require('drix-brain/src/fetch/fetchAndStrip');

const app = express();
app.post('/api/cross-sell/run', async (req, res) => {
  const page = await fetchAndStrip(req.body.url);
  const result = await callLLM(MY_CROSS_SELL_PROMPT, JSON.stringify(page));
  res.json(result);
});
```

Eventually the brain becomes a **separately deployed HTTP service** and product apps call it over the network — but for the first cut, importing as a Node module is fine and easier to debug.

---

## What's next (in order)

1. **Run `npm install && npm run smoke`** — confirm nothing's broken from the copy.
2. **Decide hosting model:** kept as a local Node module that products `require()`, OR promoted to its own deployed service (probably as the existing `TargetedDecomposition` Railway app).
3. **Triage prompts.** Pull `INGEST_PROMPT` and any other genuinely shared prompts out of `server.js` into `src/prompts/`. Leave product-specific ones (`SMB_PROMPT`, `STRATEGIES_PROMPT_AI_OPPS`) with their products.
4. **Wire one product first.** Cross-Sell is the easiest — already isolated. Make a new repo/folder for it that consumes this brain. Prove the pattern before doing the rest.
5. **Migrate the remaining products one at a time**, in the order in `ReadyLead_Separation_Plan.md`: Cross-Sell → AI Opps → SMB → Mentor Match → Enterprise.

---

## Rules to keep this brain healthy

- **No Express in here.** The moment the brain knows about HTTP routes, you've recreated the original problem.
- **No product-specific prompts in here.** If a prompt only one product uses, it lives with that product.
- **No UI assumptions.** No HTML, no React, no static files.
- **Every export is a pure module function or an object.** No globals.
- **Original repo stays the source of truth until cutover.** If you fix a bug in `DRiX-Ready-Leads-v2/db.js`, apply the same fix here. Track those drifts in `MANIFEST.md`.

---

## Related

- `C:\Users\SteveWinfiel_12vs805\Documents\DRiX-Ready-Leads-v2` — the original monorepo (still live, untouched by this copy).
- `C:\Users\SteveWinfiel_12vs805\Documents\TargetedDecomposition` — the upstream TDE service. The brain calls it as a cache. Long term, this brain may merge into TDE.
# DRiX-Brain
