// fetchAndStrip.js — extracted from DRiX-Ready-Leads-v2/server.js (lines 485-611)
// Two-tier URL fetcher: tries Firecrawl (JS-rendered markdown) first, falls
// back to plain fetch + HTML stripping. Returns {url, title, description, text}.
//
// Source-of-truth: DRiX-Ready-Leads-v2/server.js
// Extracted: 2026-05-30
// Do NOT edit this in place yet — original is still in use.

require('dotenv').config();

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || '';

// Firecrawl — JS-rendering scraper for SPAs and modern sites.
// Returns null on missing key / failure / thin content (caller falls back).
async function firecrawlScrape(url) {
  if (!FIRECRAWL_API_KEY) return null;
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) {
      console.log(`[Firecrawl] ${res.status} for ${url} — falling back to basic fetch`);
      return null;
    }
    const data = await res.json();
    const md = data?.data?.markdown || data?.markdown || '';
    if (!md || md.length < 50) {
      console.log(`[Firecrawl] thin content (${md.length} chars) for ${url} — falling back`);
      return null;
    }
    const meta = data?.data?.metadata || {};
    console.log(`[Firecrawl] Scraped ${md.length} chars from ${url}`);
    return {
      url,
      title: meta.title || meta.ogTitle || null,
      description: meta.description || meta.ogDescription || null,
      text: md.slice(0, 40000)
    };
  } catch (e) {
    console.log(`[Firecrawl] ${url}: ${e.message} — falling back to basic fetch`);
    return null;
  }
}

async function fetchAndStrip(url) {
  // Try Firecrawl first — JS-rendering, clean markdown. Falls through on miss.
  const fc = await firecrawlScrape(url);
  if (fc) return fc;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DRiXBrain/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    const description = descMatch ? descMatch[1].trim() : null;
    return { url, title, description, text: cleaned.slice(0, 40000) };
  } catch (e) {
    throw new Error(`Fetch ${url}: ${e.message}`);
  }
}

module.exports = { fetchAndStrip, firecrawlScrape };
