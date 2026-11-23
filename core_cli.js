#!/usr/bin/env node
/*
 * core_cli.js -- runs core.js on data.js from the command line so verify.py
 * can compare browser JS calculations directly against independent pandas checks.
 */
const fs = require('fs');
const path = require('path');

global.window = global;
require(path.join(__dirname, 'data.js'));
const Core = require(path.join(__dirname, 'core.js'));
const core = Core.create(global.BEYOND_FORD);

const req = JSON.parse(fs.readFileSync(0, 'utf8'));
let out;
switch (req.cmd) {
  case 'rows':
    out = core.N;
    break;
  case 'validate':
    out = core.validateFilters(req.opts || {});
    break;
  case 'filter_count':
    out = core.filterPool(req.opts || {}).length;
    break;
  case 'eligible_summary': {
    const pool = core.filterPool(req.opts || {});
    const elig = core.filterEligible(pool, req.budget);
    const nonFord = [];
    let atCap = 0;
    for (let j = 0; j < elig.length; j++) {
      const r = core.rowAt(elig[j]);
      if (r.model !== 'Ford Escape') nonFord.push(r.idx);
      if (r.price === req.budget) atCap++;
    }
    out = { pool: pool.length, eligible: elig.length, nonFord: nonFord.length, atCap };
    break;
  }
  case 'spread': {
    const pool = core.filterPool(req.opts || {});
    out = core.priceSpreadByModel(pool, (req.opts && req.opts.models) || null, req.budget);
    break;
  }
  case 'gaps': {
    const pool = core.filterPool(req.opts || {});
    out = core.matchedPriceGaps(pool, req.minPerSide || 15);
    break;
  }
  case 'regions': {
    const pool = core.filterPool(req.opts || {});
    out = core.regionalAvailability(pool, req.model || 'Ford Escape', req.budget);
    break;
  }
  case 'condition_mix': {
    const pool = core.filterPool(req.opts || {});
    const elig = core.filterEligible(pool, req.budget);
    out = core.conditionMix(elig, req.model || null);
    break;
  }
  case 'fuel_cost':
    out = core.fuelCost(req.miles, req.mpg, req.price);
    break;
  case 'summary':
    out = core.buildVerifiedSummary(req.state, req.prevBudget != null ? req.prevBudget : null);
    break;
  default:
    throw new Error('unknown cmd ' + req.cmd);
}
process.stdout.write(JSON.stringify(out, (k, v) => (typeof v === 'number' && !isFinite(v) ? null : v)));
