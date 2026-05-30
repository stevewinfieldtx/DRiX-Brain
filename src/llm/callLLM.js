// callLLM.js — extracted from DRiX-Ready-Leads-v2/server.js (lines 367-483)
// The OpenRouter wrapper used by every product flow. Pure function, no Express deps.
//
// Source-of-truth: DRiX-Ready-Leads-v2/server.js
// Extracted: 2026-05-30
// Do NOT edit this in place yet — original is still in use. Treat this as the
// new home; reconcile any drift back here once the brain is live.

require('dotenv').config();

const OPENROUTER_API_KEY  = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL_ID = process.env.OPENROUTER_MODEL_ID;


// When a responseSchema is supplied, build a tool_use request so the model is
// FORCED to fill every required field (no more dropped nested pivot fields).
// Otherwise fall back to the JSON-object response_format.
function buildBody({ model, systemPrompt, userContent, temperature, maxTokens, responseSchema }) {
  const base = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent }
    ],
    temperature,
    max_tokens: maxTokens
  };
  if (responseSchema) {
    base.tools = [{
      type: 'function',
      function: {
        name: 'submit_pitch',
        description: 'Submit the structured pitch result. You MUST fill every required field.',
        parameters: responseSchema
      }
    }];
    base.tool_choice = { type: 'function', function: { name: 'submit_pitch' } };
  } else {
    base.response_format = { type: 'json_object' };
  }
  return base;
}

// Extract the structured JSON from the model response. Handles BOTH paths:
// - tool_use:  message.tool_calls[0].function.arguments (string of JSON)
// - json mode: message.content (string of JSON)
function extractStructured(messageObj) {
  const tc = messageObj?.tool_calls?.[0];
  if (tc?.function?.arguments) {
    return { content: tc.function.arguments, viaTool: true };
  }
  return { content: messageObj?.content || '', viaTool: false };
}

async function callLLM(systemPrompt, userContent, { maxTokens = 4500, temperature = 0.3, retries = 1, modelOverride = null, responseSchema = null } = {}) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');
  const model = modelOverride || OPENROUTER_MODEL_ID;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'DRiX Brain'
        },
        body: JSON.stringify(buildBody({
          model, systemPrompt, userContent, temperature, maxTokens, responseSchema
        }))
      });
      if (!response.ok) {
        const err = await response.text();
        console.error(`[callLLM] HTTP ${response.status} (attempt ${attempt + 1}/${retries + 1}, model=${model}): ${err.slice(0, 300)}`);
        if (attempt < retries) { await new Promise(r => setTimeout(r, 2000)); continue; }
        throw new Error(`LLM ${response.status}: ${err.slice(0, 300)}`);
      }
      const data = await response.json();
      const messageObj = data?.choices?.[0]?.message;
      const { content, viaTool } = extractStructured(messageObj);
      const finishReason = data?.choices?.[0]?.finish_reason;
      if (!content) {
        console.warn(`[callLLM] Empty response (attempt ${attempt + 1}/${retries + 1}, finish_reason=${finishReason}, model=${data?.model || '?'})`);
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1500)); continue; }
        throw new Error(`Empty LLM response after ${retries + 1} attempts (finish_reason: ${finishReason || 'unknown'} — model may have filtered this content)`);
      }
      if (finishReason === 'length') {
        console.warn(`[callLLM] Response truncated (finish_reason=length, attempt ${attempt + 1}/${retries + 1}, model=${data?.model || '?'}, content_len=${content.length})`);
      }
      const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch (parseErr) {
        console.error(`[callLLM] JSON parse failed (attempt ${attempt + 1}/${retries + 1}): ${parseErr.message} — raw: ${cleaned.slice(0, 500)}`);
        const salvaged = salvageJSON(cleaned);
        if (salvaged) {
          console.log(`[callLLM] Salvaged truncated JSON successfully`);
          return salvaged;
        }
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1500)); continue; }
        throw new Error(`Invalid JSON from LLM after ${retries + 1} attempts: ${parseErr.message}`);
      }
    } catch (err) {
      if (attempt < retries && !err.message.includes('after')) {
        console.warn(`[callLLM] Attempt ${attempt + 1} failed: ${err.message} — retrying…`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
}

// Attempt to fix truncated JSON (common with smaller models hitting token limits)
function salvageJSON(str) {
  try {
    let opens = 0, closesNeeded = '';
    for (const ch of str) {
      if (ch === '{') { opens++; closesNeeded = '}' + closesNeeded; }
      else if (ch === '[') { opens++; closesNeeded = ']' + closesNeeded; }
      else if (ch === '}' || ch === ']') { closesNeeded = closesNeeded.slice(1); }
    }
    if (closesNeeded.length > 0 && closesNeeded.length < 10) {
      let trimmed = str.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '');
      const parsed = JSON.parse(trimmed + closesNeeded);
      return parsed;
    }
  } catch (_) {}
  return null;
}

// Attempt to repair a strategy response that has the data but in the wrong shape
function repairStrategyResponse(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && val[0]?.title && val[0]?.explanation) {
      console.log(`[strategy-repair] Found strategies under key "${key}" instead of "strategies"`);
      return { ...obj, strategies: val };
    }
  }
  if (Array.isArray(obj) && obj.length > 0 && obj[0]?.title) {
    console.log(`[strategy-repair] Response was a bare array, wrapping`);
    return { strategies: obj, top_pick_id: obj[0]?.id || 's1', top_pick_reasoning: 'First strategy selected' };
  }
  if (Array.isArray(obj.strategies)) {
    obj.strategies = obj.strategies.filter(s => s && (s.title || s.explanation));
    obj.strategies.forEach((s, i) => {
      if (!s.id) s.id = `s${i + 1}`;
      if (!s.title) s.title = s.explanation?.slice(0, 50) || `Strategy ${i + 1}`;
      if (!s.target_persona) s.target_persona = 'General';
      if (!s.pain_anchor) s.pain_anchor = 'Business Challenge';
      if (!s.strategy_force) s.strategy_force = 'balanced';
      if (!s.confidence) s.confidence = 60;
    });
    if (!obj.top_pick_id && obj.strategies.length > 0) obj.top_pick_id = obj.strategies[0].id;
  }
  return obj;
}

module.exports = { callLLM, salvageJSON, repairStrategyResponse };
