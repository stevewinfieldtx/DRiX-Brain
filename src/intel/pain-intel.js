// pain-intel.js — Pain-surfacing generator.
//
// EXTRACTED from DRiX-Ready-Leads-v2/server.js (PAIN_PROMPT + extractPainPoints).
// This completes the MANIFEST "Prompts inside server.js — TBD" triage: the pain
// generator is a SHARED capability, so it belongs in the brain, not in any one
// product. Kept as a PURE generator (input -> LLM -> normalized output); caching
// is the caller's concern, mirroring company-intel's enrichCompany.

const { callLLM } = require('../llm/callLLM');

const PAIN_PROMPT = `Pain-surfacing phase of TDE. Be concise — short sentences only.

INPUT: customer atoms, optional industry/sub-industry/region, optional target_title (the role the rep is pitching), is_archetype flag.

Produce 2-4 pain points at each of three levels:
  1) company_pain — specific to THIS customer (empty array if is_archetype=true)
  2) subindustry_pain — patterns typical of the sub-industry/segment
  3) industry_pain — broader forces affecting the whole industry

If target_title is provided, weight pain points toward what that role personally owns and bias persona_primary.title to match target_title where the atom supports it. Interpret target_title through whatever context is also supplied (industry / subindustry / customer atoms) — a CFO at a regional bank has different pain than a CFO at a SaaS startup. If target_title is null, treat persona selection as open and pick what the atoms most clearly point to.

Persona titles must be one of: Executive/C-Suite | CFO/Finance | CISO/Security | CTO/IT | VP Sales | VP Marketing | Operations | Practitioner | End User | General
Urgency: "high" | "medium" | "low"
Economic levers: ROI | Cost-Out | Speed | Quality | Growth | Risk-Reduction
Inertia forces: Sunk Cost | Change Fatigue | Risk Aversion | Political Cost | Procedural Gravity | No Forcing Function | Market Dynamics

Each pain point:
{
  "id": "<kebab-id>",
  "level": "company|subindustry|industry",
  "title": "<3-6 word label>",
  "description": "<1 sentence>",
  "evidence": "<1 sentence — cite atom if company-level, else segment observation>",
  "persona_primary": {
    "title": "<role>",
    "rationale": "<1 sentence — why they own this>",
    "perspective": "<1 sentence — their inner voice>",
    "urgency": "<level>", "economic_lever": "<lever>", "inertia_force": "<force>"
  },
  "persona_secondary": {
    "title": "<different role>",
    "rationale": "<1 sentence — why they're affected>",
    "perspective": "<1 sentence — their inner voice>",
    "urgency": "<level>", "economic_lever": "<lever>", "inertia_force": "<force>"
  }
}

Every pain MUST have two distinct personas with different roles. Each persona gets their own urgency/lever/inertia.
Company-level: only cite facts from provided atoms — do NOT invent. Sub-industry/industry: use segment-typical patterns, no invented incidents.
If is_archetype=true, company_pain must be [].

JSON only, no markdown: { "company_pain": [...], "subindustry_pain": [...], "industry_pain": [...] }`;

/**
 * Surface 2-4 pain points at company / sub-industry / industry levels, each with
 * a primary and secondary persona (the GUI "Primary Owner" / "Also Affected").
 *
 * @param {Object} customer - { name, summary, atoms[], is_archetype? }
 * @param {Object} opts
 *   @param {string} [opts.industry]
 *   @param {string} [opts.subindustry]
 *   @param {string} [opts.targetTitle]  - role the rep is pitching (biases persona_primary)
 *   @param {boolean} [opts.isArchetype] - overrides customer.is_archetype if set
 *   @param {number} [opts.maxTokens=4000]
 * @returns {Promise<{company_pain:Array, subindustry_pain:Array, industry_pain:Array}>}
 */
async function extractPainPoints(customer = {}, opts = {}) {
  const {
    industry = null, subindustry = null, targetTitle = null,
    isArchetype = null, maxTokens = 4000,
  } = opts;
  const archetype = isArchetype != null ? isArchetype : !!customer.is_archetype;

  const userContent = JSON.stringify({
    is_archetype: archetype,
    industry, subindustry,
    target_title: targetTitle,
    customer: { name: customer.name, summary: customer.summary, atoms: customer.atoms || [] },
  });

  const parsed = await callLLM(PAIN_PROMPT, userContent, { maxTokens });
  return {
    company_pain:     Array.isArray(parsed.company_pain)     ? parsed.company_pain     : [],
    subindustry_pain: Array.isArray(parsed.subindustry_pain) ? parsed.subindustry_pain : [],
    industry_pain:    Array.isArray(parsed.industry_pain)    ? parsed.industry_pain    : [],
  };
}

module.exports = { extractPainPoints, PAIN_PROMPT };
