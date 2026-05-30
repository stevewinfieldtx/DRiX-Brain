// DRiX-Brain — public entrypoint
// Re-exports the core capabilities so consumers can do:
//
//   const brain = require('drix-brain');
//   await brain.callLLM(systemPrompt, userContent, opts);
//
// Or pull a specific module:
//
//   const { fetchAndStrip } = require('drix-brain/src/fetch/fetchAndStrip');
//
// This is the SHARED CORE. It must stay framework-agnostic — no Express, no
// product-specific prompts, no UI assumptions. Anything product-specific lives
// in the product apps that call into the brain.

const { callLLM, salvageJSON, repairStrategyResponse } = require('./llm/callLLM');
const { fetchAndStrip, firecrawlScrape } = require('./fetch/fetchAndStrip');
const db = require('./db/db');
const cache = require('./cache');

// Intel modules — copied verbatim from DRiX-Ready-Leads-v2.
const companyIntel = require('./intel/company-intel');
const competitiveIntel = require('./intel/competitive-intel');
const individualScan = require('./intel/individual-scan');
const meetingAnalysis = require('./intel/meeting-analysis');
const osintEnrichment = require('./intel/osint-enrichment');

module.exports = {
  // LLM
  callLLM,
  salvageJSON,
  repairStrategyResponse,

  // Web fetch
  fetchAndStrip,
  firecrawlScrape,

  // DB
  db,

  // Cache (Postgres-backed)
  cache,

  // Intel
  companyIntel,
  competitiveIntel,
  individualScan,
  meetingAnalysis,
  osintEnrichment,
};
