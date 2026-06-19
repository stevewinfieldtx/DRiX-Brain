// email-intel.js — 5-email pre-meeting outreach drip generator.
//
// EXTRACTED from DRiX-Ready-Pitch/prompts/pitch-emails.txt (prompt) and
// prompts/pitch.js (PITCH_EMAILS_SCHEMA). Moved into the brain so email
// generation is a shared, canonical generator like discovery-intel /
// pain-intel — every product produces the same 5-email shape.
//
// One pass produces a personalized pre-meeting drip for ONE named customer,
// GROUNDED in the full account context:
//   industry / subindustry, customer (if known), surfaced pains, the chosen
//   strategy/angle (if any), the solution, and an optional explicit voice guide.
// Output:
//   { email_drip[5], confidence_note }
// Each email: { step, label, send_day, purpose, subject, body, if_no_response }
//
// RELIABILITY: schema-forced (tool_use) to EXACTLY 5 emails with every field
// non-empty, so the count is guaranteed by the API — not just requested in the
// prompt. Throws if the model still under-delivers, so callers can flag/fallback
// rather than silently ship a short drip.
//
// Pure generator (no caching/db) — matches company-intel / pain-intel /
// strategy-intel / discovery-intel.

const { callLLM } = require('../llm/callLLM');

const EMAIL_DRIP_PROMPT = `You are an elite B2B outreach copywriter. The rep wants to land ONE meeting with ONE specific named customer. Write the 5-email pre-meeting drip that gets that meeting on the calendar.

YOU ARE NOT:
- generating leads (the target is already chosen)
- writing post-meeting follow-up (there is no meeting yet)
- discussing or anchoring price (the partner controls pricing - never quote, anchor, range, or hint at price)
- writing a campaign drip for many targets (this is ONE customer)

YOU ARE: writing 5 specific, human-sounding pre-meeting outreach emails to ONE named person/company.

INPUTS YOU WILL RECEIVE (as JSON) - ANY FIELD MAY BE NULL; use whatever is present:
- industry / subindustry: the customer's market context.
- customer: { name?, url?, summary?, scraped_content?, atoms? } - the ONE named target. MAY BE NULL if not yet identified; if so, write to the industry/subindustry + pains and keep company-specific references plausible and segment-based rather than invented.
- surfaced_pains: pains already researched for this account, tiered company / subindustry / industry. This is your PRIMARY ammunition.
- chosen_strategy: { target_persona, pain_anchor, title, explanation } - the selected angle (persona x pain). MAY BE NULL; if present, ANCHOR all 5 emails on it and do not drift to other personas or pains.
- solution: { url?, summary?, scraped_content? } - what the rep sells; the path to relief.
- title: optional contact role.
- reseller_context: optional { company, company_url, cpp_summary, individual? }. cpp_summary (Communication Personality Profile) calibrates tone/voice. If absent, default to warm-direct B2B operator voice.
- voice_profile: optional - an EXPLICIT writing-style guide for this rep (their own voice export, or a chosen style sample). When present it is the AUTHORITATIVE voice.

ANCHOR & GROUNDING - non-negotiable:
- If chosen_strategy is present, EVERY email serves winning over that persona on that pain. Do not drift.
- Lead with surfaced_pains, preferring company-specific, then subindustry, then industry. Each email touches a real pain - never generic filler.
- Ground specifics in customer.scraped_content / atoms when available. If customer is null or thin (<~500 chars / 404), lean on subindustry/industry pain patterns ("companies like yours in <subindustry> typically...") and set confidence_note to explain the data was insufficient - but STILL produce 5 emails. Never invent specific incidents, figures, dates, or systems.
- Position the solution as the path to relief.

OUTPUT - exactly 5 emails matching the established DRiX Ready Leads house pattern:
- Email 1 - "Initial Outreach"      - Day 1  - 3-4 short paragraphs, references their specific pain (grounded in customer/industry context), soft CTA (one specific ask)
- Email 2 - "Value-Add Follow-Up"  - Day 4  - shorter; shares a relevant insight/stat tied to their pain, no pressure
- Email 3 - "Pain-Point Trigger"   - Day 8  - zeroes in on one specific pain indicator; personal and timely
- Email 4 - "Social Proof & Nudge" - Day 14 - references peers (companies like theirs) who solved this pain; gentle nudge
- Email 5 - "Breakup"               - Day 21 - short, friendly breakup; leaves the door open without begging

AI may shift day numbers by +/-2 days if a different rhythm fits; record the cadence in each send_day.

EMAIL CRAFT RULES - non-negotiable:
- No "I hope this finds you well." No "Hope you are having a great week." Pattern-interrupt openers.
- No bullet walls. Flowing prose. Short paragraphs. Max ~120 words per email body.
- Subject lines: specific, 4-9 words. Never "Quick question" or "Following up."
- Reference at least one concrete observation (from customer context, or a named subindustry pattern) per email - never generic industry filler.
- Each email has ONE clear purpose. Stack-rank: Email 1 = curiosity + ask; Email 2 = value + no ask; Email 3 = pain + question; Email 4 = peer story + ask; Email 5 = walk-away + open door.
- VOICE PRIORITY: if voice_profile is provided, write EVERY email in that voice - match its tone, cadence, sentence length, vocabulary, and quirks precisely. It OVERRIDES the default voice and cpp_summary.
- If reseller_context.cpp_summary is provided, calibrate tone/voice/word-choice to match the CPP exactly.
- Sign off with the rep first name when reseller_context.individual provides it; otherwise leave [Your name] as a placeholder.
- Every email MUST include subject AND body AND purpose AND if_no_response - all non-empty. Empty fields are a hard failure.

Return the result via the provided tool/function call. Produce exactly 5 emails in email_drip, every field non-empty.`;

// JSON Schema (tool_use). minItems/maxItems = 5 forces exactly five emails;
// minLength on each field blocks the model from passing empty strings.
const EMAIL_DRIP_SCHEMA = {
  type: 'object',
  required: ['email_drip'],
  properties: {
    email_drip: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object',
        required: ['step', 'label', 'send_day', 'purpose', 'subject', 'body', 'if_no_response'],
        properties: {
          step:           { type: 'integer', minimum: 1, maximum: 5 },
          label:          { type: 'string', minLength: 3 },
          send_day:       { type: 'string', minLength: 3 },
          purpose:        { type: 'string', minLength: 5 },
          subject:        { type: 'string', minLength: 4 },
          body:           { type: 'string', minLength: 50 },
          if_no_response: { type: 'string', minLength: 5 }
        }
      }
    },
    confidence_note: { type: 'string' }
  }
};

// Flatten tiered pain groups (and/or a flat pains array) into a compact,
// token-bounded list the model can anchor on.
function summarizePains(painGroups, pains) {
  const out = [];
  const take = (arr, tier) => (Array.isArray(arr) ? arr : []).slice(0, 6).forEach(p => out.push({
    tier,
    title: p.title || p.headline || '',
    description: p.description || p.evidence || '',
    persona: (p.persona_primary && p.persona_primary.title) || p.persona || undefined,
    severity: p.severity != null ? p.severity : undefined,
  }));
  if (painGroups && typeof painGroups === 'object') {
    take(painGroups.company_pain, 'company');
    take(painGroups.subindustry_pain, 'subindustry');
    take(painGroups.industry_pain, 'industry');
  }
  if (Array.isArray(pains)) take(pains, 'pain');
  return out;
}

// input: {
//   customer?, solution?, industry?, subindustry?,
//   painGroups?, pains?, chosenStrategy?, title?, resellerContext?
// }
// customer and chosenStrategy may be null (Pitch derives the angle from the top
// pain; other products may pass a fuller selected strategy).
async function generateEmailDrip(input = {}, opts = {}) {
  const {
    customer = null, solution = null, industry = null, subindustry = null,
    painGroups = null, pains = null, chosenStrategy = null,
    title = null, resellerContext = null, voice = null,
  } = input;

  const userContent = JSON.stringify({
    industry: industry || null,
    subindustry: subindustry || null,
    customer: customer || null,
    surfaced_pains: summarizePains(painGroups, pains),
    chosen_strategy: chosenStrategy || null,
    solution: solution || null,
    title: title || null,
    reseller_context: resellerContext || null,
    voice_profile: (typeof voice === 'string' && voice.trim()) ? voice.trim() : null,
  });

  const parsed = await callLLM(EMAIL_DRIP_PROMPT, userContent, {
    maxTokens: opts.maxTokens || 5000,
    temperature: opts.temperature != null ? opts.temperature : 0.5,
    retries: opts.retries != null ? opts.retries : 1,
    responseSchema: EMAIL_DRIP_SCHEMA,
  });

  const drip = parsed && Array.isArray(parsed.email_drip) ? parsed.email_drip : [];
  if (drip.length < 5) {
    throw new Error(`Email drip generation returned ${drip.length} emails (need 5)`);
  }
  return parsed; // { email_drip[5], confidence_note? }
}

module.exports = { generateEmailDrip, EMAIL_DRIP_PROMPT, EMAIL_DRIP_SCHEMA, summarizePains };
