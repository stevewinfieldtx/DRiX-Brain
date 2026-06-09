// discovery-intel.js — Lead-hydration / discovery generator.
//
// EXTRACTED from DRiX-Ready-Leads-v2/server.js (DISCOVERY_INTEL_PROMPT +
// generateDiscoveryIntel). This is the canonical "questions" format AND its
// creation, now shared in the brain so every product renders the same shape.
//
// One pass produces the whole hydration payload anchored on a chosen
// (persona x pain) angle:
//   { score, whoIsThis, primaryLead, painIndicators[4], questions[3], emailCampaign[5] }
// Each question: { stage, question, purpose, pain_it_targets, tone_guidance,
//                  positive_responses[{response,next_step}],
//                  neutral_negative_responses[{response,pivot}] }
//
// Pure generator (no caching/db) — matches company-intel / pain-intel / strategy-intel.

const { callLLM } = require('../llm/callLLM');

const DISCOVERY_INTEL_PROMPT = `You are an elite B2B sales strategist and coach.
Given a target company, the solution being sold, the pains already surfaced, and a CHOSEN sales angle (a specific persona × pain pair), generate highly specific, research-backed sales intelligence for a first meeting.

ANCHOR EVERYTHING on the chosen angle: the questions, pain chips, and emails must all serve winning over the named persona on the named pain. Do not drift to other personas.

CRITICAL QUALITY RULES FOR QUESTIONS:
- Every question must be specific enough that the prospect thinks "this person researched my company."
- Every response scenario must be a realistic QUOTE — how a real person in this role/industry would actually say it.
- Every next_step and pivot must contain the ACTUAL WORDS the rep should say — not instructions like "redirect" or "probe deeper."
- Purpose teaches strategy — the psychological or competitive reason behind the question, not the obvious.
- tone_guidance coaches delivery — when to pause, when to empathize, when to challenge.
- The 3 questions flow as one conversation: OPENING reveals the pain, DEEPENING quantifies it, ADVANCEMENT gets the prospect to envision the solution.
- NEVER use generic business jargon. Write like a human talks.

ANTI-FABRICATION: Only state specific facts about the company that appear in the provided atoms/evidence. If you lack a grounded fact, phrase it as a segment pattern ("companies like yours typically…") — never invent specific incidents, figures, dates, or systems.

Return ONLY valid JSON (no markdown) in this exact shape:
{
  "score": <integer 1-100 fit score>,
  "whoIsThis": "<2-3 sentence narrative: what they do, market position, why relevant>",
  "primaryLead": { "title": "<the persona/role to target>", "topic": "<the core conversation topic>" },
  "painIndicators": [ { "label": "<2-4 word pain chip>", "explanation": "<1-2 sentences: why it's their pain and how the solution addresses it>" } ],
  "questions": [
    {
      "stage": "OPENING — Discovery",
      "question": "<specific, provocative opener referencing their context>",
      "purpose": "<2-3 sentences coaching the strategy behind it>",
      "pain_it_targets": "<the real problem it surfaces, not a category>",
      "tone_guidance": "<how to deliver it>",
      "positive_responses": [ { "response": "<realistic prospect quote>", "next_step": "<exact words the rep says next>" }, { "response": "<2nd>", "next_step": "<2nd>" } ],
      "neutral_negative_responses": [ { "response": "<realistic pushback quote>", "pivot": "<exact pivot words + why it works>" }, { "response": "<2nd>", "pivot": "<2nd>" } ]
    },
    { "stage": "DEEPENING — Pain Exploration", "question": "...", "purpose": "...", "pain_it_targets": "...", "tone_guidance": "...", "positive_responses": [ {"response":"...","next_step":"..."}, {"response":"...","next_step":"..."} ], "neutral_negative_responses": [ {"response":"...","pivot":"..."}, {"response":"...","pivot":"..."} ] },
    { "stage": "ADVANCEMENT — Next Step", "question": "<vision question that gets them to sell themselves>", "purpose": "...", "pain_it_targets": "...", "tone_guidance": "...", "positive_responses": [ {"response":"...","next_step":"<the specific close: demo/pilot/follow-up with exact words>"}, {"response":"...","next_step":"..."} ], "neutral_negative_responses": [ {"response":"...","pivot":"<graceful door-open with specific words>"}, {"response":"...","pivot":"..."} ] }
  ],
  "emailCampaign": [
    { "step": 1, "label": "Initial Outreach",      "sendDay": "Day 1",  "subject": "<subject>", "body": "<3-4 short paragraphs, references their specific pain, soft CTA>" },
    { "step": 2, "label": "Value-Add Follow-Up",   "sendDay": "Day 4",  "subject": "<subject>", "body": "<shorter; shares a relevant insight/stat, no pressure>" },
    { "step": 3, "label": "Pain-Point Trigger",    "sendDay": "Day 8",  "subject": "<subject>", "body": "<zeroes in on one specific pain indicator; personal and timely>" },
    { "step": 4, "label": "Social Proof & Nudge",  "sendDay": "Day 14", "subject": "<subject>", "body": "<references peers who solved this; gentle nudge>" },
    { "step": 5, "label": "Breakup",               "sendDay": "Day 21", "subject": "<subject>", "body": "<short, friendly breakup; leaves door open>" }
  ]
}

DISCIPLINE: exactly 4 painIndicators, exactly 3 questions (the three stages above), exactly 5 emailCampaign steps. Each question needs 2 positive_responses and 2 neutral_negative_responses.`;

async function generateDiscoveryIntel({ customer, solutionIntel, painGroups, chosenStrategy, customerName, customerWebsite, industryName }) {
  const atoms = customer?.atoms || [];
  // Bound the payload: prioritize the most decision-relevant atom types.
  const keyTypes = ['weakness', 'mission_gap', 'buying_trigger', 'differentiator', 'icp', 'proof_point', 'product'];
  const relevantAtoms = atoms
    .filter(a => keyTypes.includes(a.type))
    .slice(0, 60)
    .map(a => ({ type: a.type, claim: a.claim, persona: a.d_persona, pressure: a.d_status_quo_pressure }));

  const pg = painGroups || {};
  const surfacedPains = [...(pg.company_pain || []), ...(pg.subindustry_pain || []), ...(pg.industry_pain || [])]
    .map(p => ({ title: p.title, description: p.description, persona: p.persona_primary?.title }))
    .slice(0, 12);

  const userContent = JSON.stringify({
    company: { name: customerName, website: customerWebsite || null, industry: industryName || null, summary: customer?.summary || '' },
    chosen_angle: {
      persona: chosenStrategy?.target_persona || 'General',
      pain: chosenStrategy?.pain_anchor || '',
      strategy_title: chosenStrategy?.title || '',
      strategy_explanation: chosenStrategy?.explanation || '',
      customer_pain: chosenStrategy?.customer_pain || ''
    },
    solution: solutionIntel,
    surfaced_pains: surfacedPains,
    customer_atoms: relevantAtoms
  });

  const parsed = await callLLM(DISCOVERY_INTEL_PROMPT, userContent, { maxTokens: 16000, temperature: 0.5, retries: 1 });
  if (!parsed || !Array.isArray(parsed.questions) || !parsed.questions.length) {
    throw new Error('Discovery intel generation returned no questions');
  }
  return parsed;
}

module.exports = { generateDiscoveryIntel, DISCOVERY_INTEL_PROMPT };
