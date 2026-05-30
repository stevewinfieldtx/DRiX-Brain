// src/cache/index.js — Public cache API.
//
// Apps consume this via:
//   const { cache } = require('drix-brain');
//   await cache.init(pool);
//   await cache.scrape.lookup(pool, url);
//   await cache.pitch.lookup(pool, inputs, resellerId);

const schema = require('./schema');
const scrape = require('./scrapeCache');
const pitch  = require('./pitchCache');
const hash   = require('./hash');

module.exports = {
  init: schema.init,
  scrape,
  pitch,
  hash,
};
