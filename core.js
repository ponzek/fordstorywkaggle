/*
 * core.js -- pure data, aggregation, validation, and verified-summary logic (no DOM).
 * Used by both the browser views and tests/verify.py (via core_cli.js in Node),
 * ensuring every chart number and Gemini AI verification fact matches pandas exactly.
 */
(function (root) {
  'use strict';

  function quantile(sorted, q) {
    const n = sorted.length;
    if (!n) return NaN;
    const h = (n - 1) * q;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);
    return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
  }

  function sortedCopy(arr) {
    return Float64Array.from(arr).sort();
  }

  function mileBandIndex(miles) {
    if (miles <= 0) return 0;
    return Math.min(4, Math.floor((miles - 1) / 25000));
  }

  function create(D) {
    const C = D.cols;
    const L = D.levels;
    const N = C.price.length;
    const modelIdx = new Map(L.model.map((m, i) => [m, i]));
    const regionIdx = new Map(L.region.map((r, i) => [r, i]));
    const condIdx = new Map(L.condition.map((c, i) => [c, i]));

    function rowAt(i) {
      return {
        idx: i,
        key: C.key[i],
        model: L.model[C.mi[i]],
        year: C.year[i],
        miles: C.miles[i],
        price: C.price[i],
        region: L.region[C.ri[i]],
        state: L.state[C.si[i]],
        date: C.date[i],
        condition: L.condition[C.ci[i]],
        hasVin: C.vin[i] === 1,
        mpg: C.mpg[i],
        mileBand: L.mileBand[mileBandIndex(C.miles[i])],
      };
    }

    function validateFilters(opts) {
      opts = opts || {};
      const y0 = opts.yearMin != null ? opts.yearMin : 2016;
      const y1 = opts.yearMax != null ? opts.yearMax : 2019;
      const m0 = opts.mileMin != null ? opts.mileMin : 0;
      const m1 = opts.mileMax != null ? opts.mileMax : 125000;
      if (!isFinite(y0) || !isFinite(y1) || y0 > y1) {
        return { ok: false, error: 'Model year minimum cannot exceed maximum year.' };
      }
      if (!isFinite(m0) || !isFinite(m1) || m0 < 0 || m1 > 125000 || m0 > m1) {
        return { ok: false, error: 'Mileage range is invalid or reversed (must be 0 to 125,000 mi with min <= max).' };
      }
      return { ok: true, error: null };
    }

    /**
     * Filter the uncapped pool of listings (all filters except budget cap).
     * opts.models: null/undefined = all models, [] = no models.
     */
    function filterPool(opts) {
      opts = opts || {};
      if (!validateFilters(opts).ok) return new Int32Array(0);
      if (Array.isArray(opts.models) && opts.models.length === 0) return new Int32Array(0);

      const mset = Array.isArray(opts.models) ? new Set(opts.models.map((m) => modelIdx.get(m))) : null;
      const y0 = opts.yearMin != null ? opts.yearMin : 2016;
      const y1 = opts.yearMax != null ? opts.yearMax : 2019;
      const m0 = opts.mileMin != null ? opts.mileMin : 0;
      const m1 = opts.mileMax != null ? opts.mileMax : 125000;
      const ri = opts.region ? (regionIdx.has(opts.region) ? regionIdx.get(opts.region) : -99) : null;
      const ci = opts.condition ? (condIdx.has(opts.condition) ? condIdx.get(opts.condition) : -99) : null;

      const out = [];
      for (let i = 0; i < N; i++) {
        if (mset && !mset.has(C.mi[i])) continue;
        if (C.year[i] < y0 || C.year[i] > y1) continue;
        if (C.miles[i] < m0 || C.miles[i] > m1) continue;
        if (ri !== null && C.ri[i] !== ri) continue;
        if (ci !== null && C.ci[i] !== ci) continue;
        out.push(i);
      }
      return Int32Array.from(out);
    }

    function filterEligible(poolIdx, budget) {
      const cap = budget == null ? Infinity : budget;
      const out = [];
      for (let j = 0; j < poolIdx.length; j++) {
        const i = poolIdx[j];
        if (C.price[i] <= cap) out.push(i);
      }
      return Int32Array.from(out);
    }

    /** Four-step budget share calculation from proposal. */
    function budgetShare(qualifyCount, totalCount) {
      if (!totalCount) {
        return { qualify: 0, total: 0, pct: null, label: 'No listings match' };
      }
      const pct = (100 * qualifyCount) / totalCount;
      return {
        qualify: qualifyCount,
        total: totalCount,
        pct,
        label: pct.toFixed(1) + '%',
      };
    }

    function budgetCoverageByModel(poolIdx, models, budgetSteps) {
      const mList = models || L.model;
      const steps = budgetSteps || [];
      const pricesByModel = new Map(mList.map((m) => [m, []]));
      for (let j = 0; j < poolIdx.length; j++) {
        const i = poolIdx[j];
        const m = L.model[C.mi[i]];
        if (pricesByModel.has(m)) pricesByModel.get(m).push(C.price[i]);
      }
      return mList.map((m) => {
        const prices = sortedCopy(pricesByModel.get(m) || []);
        const total = prices.length;
        const points = steps.map((b) => {
          let lo = 0;
          let hi = total;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (prices[mid] <= b) lo = mid + 1;
            else hi = mid;
          }
          return {
            budget: b,
            qualify: lo,
            total,
            pct: total ? (100 * lo) / total : null,
          };
        });
        return { model: m, total, points };
      });
    }

    function priceSpreadByModel(poolIdx, models, budget) {
      const mList = models || L.model;
      const by = new Map(mList.map((m) => [m, []]));
      for (let j = 0; j < poolIdx.length; j++) {
        const i = poolIdx[j];
        const m = L.model[C.mi[i]];
        if (by.has(m)) by.get(m).push(C.price[i]);
      }
      return mList.map((m) => {
        const arr = by.get(m) || [];
        const s = sortedCopy(arr);
        const n = s.length;
        let q = 0;
        for (let k = 0; k < n; k++) if (s[k] <= budget) q++;
        const share = budgetShare(q, n);
        return {
          model: m,
          n,
          qualify: q,
          pct: share.pct,
          shareLabel: share.label,
          median: n ? quantile(s, 0.5) : null,
          q25: n ? quantile(s, 0.25) : null,
          q75: n ? quantile(s, 0.75) : null,
          min: n ? s[0] : null,
          max: n ? s[n - 1] : null,
        };
      });
    }

    function medianByModelYear(poolIdx, models, years) {
      const mList = models || L.model;
      const yList = years || [2016, 2017, 2018, 2019];
      const by = new Map();
      mList.forEach((m) => {
        const ym = new Map(yList.map((y) => [y, []]));
        by.set(m, ym);
      });
      for (let j = 0; j < poolIdx.length; j++) {
        const i = poolIdx[j];
        const m = L.model[C.mi[i]];
        const ym = by.get(m);
        if (ym && ym.has(C.year[i])) ym.get(C.year[i]).push(C.price[i]);
      }
      return mList.map((m) => {
        const ym = by.get(m);
        return {
          model: m,
          points: yList.map((y) => {
            const s = sortedCopy(ym.get(y) || []);
            const n = s.length;
            return {
              year: y,
              n,
              median: n ? quantile(s, 0.5) : null,
              q25: n ? quantile(s, 0.25) : null,
              q75: n ? quantile(s, 0.75) : null,
            };
          }),
        };
      });
    }

    /**
     * Matched price gaps vs Ford Escape across (model year x 25,000-mile band) strata.
     * Uses uncapped poolIdx. Only strata with >= minPerSide listings on BOTH sides qualify;
     * each qualifying stratum has equal weight.
     */
    function matchedPriceGaps(poolIdx, minPerSide) {
      const cutoff = minPerSide == null ? 15 : minPerSide;
      const escName = 'Ford Escape';
      const escId = modelIdx.get(escName);
      const cellPrices = new Map(); // "mi|year|band" -> number[]

      for (let j = 0; j < poolIdx.length; j++) {
        const i = poolIdx[j];
        const band = mileBandIndex(C.miles[i]);
        const key = `${C.mi[i]}|${C.year[i]}|${band}`;
        if (!cellPrices.has(key)) cellPrices.set(key, []);
        cellPrices.get(key).push(C.price[i]);
      }

      const years = [2016, 2017, 2018, 2019];
      const bands = [0, 1, 2, 3, 4];
      const out = [];

      L.model.forEach((m, mi) => {
        if (m === escName) return;
        const strata = [];
        let sumGap = 0;
        let escMatched = 0;
        let altMatched = 0;
        for (const y of years) {
          for (const b of bands) {
            const escArr = cellPrices.get(`${escId}|${y}|${b}`) || [];
            const altArr = cellPrices.get(`${mi}|${y}|${b}`) || [];
            if (escArr.length >= cutoff && altArr.length >= cutoff) {
              const escMed = quantile(sortedCopy(escArr), 0.5);
              const altMed = quantile(sortedCopy(altArr), 0.5);
              const diff = altMed - escMed;
              strata.push({
                year: y,
                band: b,
                bandLabel: L.mileBand[b],
                escN: escArr.length,
                altN: altArr.length,
                escMedian: escMed,
                altMedian: altMed,
                gap: diff,
              });
              sumGap += diff;
              escMatched += escArr.length;
              altMatched += altArr.length;
            }
          }
        }
        out.push({
          model: m,
          cutoff,
          strataCount: strata.length,
          gap: strata.length ? sumGap / strata.length : null,
          escMatched,
          altMatched,
          strata,
        });
      });
      return out;
    }

    function regionalAvailability(poolIdxNoRegion, model, budget) {
      const miTarget = model ? modelIdx.get(model) : null;
      const totByReg = [0, 0, 0, 0];
      const qualByReg = [0, 0, 0, 0];
      for (let j = 0; j < poolIdxNoRegion.length; j++) {
        const i = poolIdxNoRegion[j];
        if (miTarget != null && C.mi[i] !== miTarget) continue;
        const r = C.ri[i];
        totByReg[r]++;
        if (C.price[i] <= budget) qualByReg[r]++;
      }
      const regions = L.region.map((reg, r) => {
        const s = budgetShare(qualByReg[r], totByReg[r]);
        return Object.assign({ region: reg }, s);
      });
      const sumQ = qualByReg.reduce((a, b) => a + b, 0);
      const sumT = totByReg.reduce((a, b) => a + b, 0);
      return {
        model: model || 'Selected models',
        regions,
        combined: Object.assign({ region: 'All U.S.' }, budgetShare(sumQ, sumT)),
      };
    }

    function conditionMix(eligibleIdx, model) {
      const miTarget = model ? modelIdx.get(model) : null;
      const counts = new Array(L.condition.length).fill(0);
      let total = 0;
      for (let j = 0; j < eligibleIdx.length; j++) {
        const i = eligibleIdx[j];
        if (miTarget != null && C.mi[i] !== miTarget) continue;
        counts[C.ci[i]]++;
        total++;
      }
      return {
        total,
        bars: L.condition.map((c, idx) => ({
          condition: c,
          count: counts[idx],
          pct: total ? (100 * counts[idx]) / total : null,
        })),
      };
    }

    function fuelCost(milesPerYear, mpg, dollarsPerGallon) {
      if (!isFinite(milesPerYear) || milesPerYear < 0 || milesPerYear > 30000) {
        return { ok: false, annualDollars: null, error: 'Annual miles must be between 0 and 30,000.' };
      }
      if (!isFinite(mpg) || mpg < 5 || mpg > 100) {
        return { ok: false, annualDollars: null, error: 'MPG must be between 5 and 100.' };
      }
      if (!isFinite(dollarsPerGallon) || dollarsPerGallon < 0 || dollarsPerGallon > 10) {
        return { ok: false, annualDollars: null, error: 'Fuel price must be between $0 and $10/gal.' };
      }
      return { ok: true, annualDollars: (milesPerYear / mpg) * dollarsPerGallon, error: null };
    }

    /**
     * Build a deterministic, verified chart summary + local caption + best-case scenario
     * from the current filter state and optional previous budget.
     */
    function buildVerifiedSummary(state, prevBudget) {
      const v = validateFilters(state);
      if (!v.ok) {
        return {
          valid: false,
          error: v.error,
          localCaption: v.error,
          bestCase: v.error,
          verifiedFacts: [],
        };
      }
      const pool = filterPool(state);
      const elig = filterEligible(pool, state.budget);
      const nonFordElig = [];
      let fordElig = 0;
      let atCapCount = 0;
      for (let j = 0; j < elig.length; j++) {
        const i = elig[j];
        if (L.model[C.mi[i]] === 'Ford Escape') fordElig++;
        else nonFordElig.push(i);
        if (C.price[i] === state.budget) atCapCount++;
      }

      const spreads = priceSpreadByModel(pool, state.models, state.budget);
      const gaps = matchedPriceGaps(filterPool(Object.assign({}, state, { models: L.model })), state.gapMinN || 15);
      const regPool = filterPool(Object.assign({}, state, { region: null }));
      const regAvail = regionalAvailability(regPool, state.focusModel || 'Ford Escape', state.budget);

      let prevEligCount = null;
      let budgetDelta = null;
      if (prevBudget != null && prevBudget !== state.budget) {
        prevEligCount = filterEligible(pool, prevBudget).length;
        budgetDelta = elig.length - prevEligCount;
      }

      // Best-case scenario computation from verified current numbers:
      // 1) Among non-Ford alternatives, find lowest median asking price or highest in-budget share
      const activeAlternatives = spreads.filter((s) => s.model !== 'Ford Escape' && s.n > 0);
      const bestShareAlt = [...activeAlternatives].sort((a, b) => (b.pct || 0) - (a.pct || 0))[0] || null;
      const cheapestMedAlt = [...activeAlternatives].sort((a, b) => (a.median || Infinity) - (b.median || Infinity))[0] || null;

      // 2) Best qualifying non-Ford listing (lowest price, tie-break lowest mileage)
      let bestListing = null;
      if (nonFordElig.length) {
        let bestIdx = nonFordElig[0];
        for (let j = 1; j < nonFordElig.length; j++) {
          const i = nonFordElig[j];
          if (C.price[i] < C.price[bestIdx] || (C.price[i] === C.price[bestIdx] && C.miles[i] < C.miles[bestIdx])) {
            bestIdx = i;
          }
        }
        bestListing = rowAt(bestIdx);
      }

      // 3) Best region for focusModel
      const bestReg = [...regAvail.regions].filter((r) => r.total > 0).sort((a, b) => (b.pct || 0) - (a.pct || 0))[0] || null;

      // 4) Lowest matched gap vs Escape
      const validGaps = gaps.filter((g) => g.gap != null).sort((a, b) => a.gap - b.gap);
      const bestGap = validGaps[0] || null;

      let localCaption = '';
      if (!pool.length) {
        localCaption = 'No listings match the current filters. Select at least one model or widen the year, mileage, or region filters.';
      } else if (elig.length === 0) {
        localCaption = `Out of ${pool.length} matching listings (${state.yearMin}–${state.yearMax}, <=${state.mileMax.toLocaleString()} mi), 0 qualify at or below $${state.budget.toLocaleString()} (0.0%). Raise the budget cap to reveal options.`;
      } else {
        const deltaNote = budgetDelta != null
          ? ` Raising the budget from $${prevBudget.toLocaleString()} to $${state.budget.toLocaleString()} changed qualifying listings by ${budgetDelta >= 0 ? '+' : ''}${budgetDelta} (from ${prevEligCount} to ${elig.length}).`
          : '';
        localCaption = `At a $${state.budget.toLocaleString()} budget cap across ${pool.length} filtered listings, ${elig.length} qualify (${((100 * elig.length) / pool.length).toFixed(1)}%), including ${nonFordElig.length} non-Ford alternatives (${atCapCount} priced exactly at the cap).${deltaNote}`;
      }

      let bestCase = 'No qualifying non-Ford alternative is in budget under the current filters.';
      if (bestShareAlt && bestListing) {
        const gapPart = bestGap
          ? ` In matched year-and-mileage groups, ${bestGap.model} tracks ${bestGap.gap >= 0 ? '+' : '-'}$${Math.round(Math.abs(bestGap.gap)).toLocaleString()} vs. Ford Escape across ${bestGap.strataCount} qualifying strata.`
          : '';
        const regPart = bestReg
          ? ` Regionally, ${bestReg.region} offers the highest share for ${regAvail.model} (${bestReg.qualify}/${bestReg.total}, ${bestReg.label}).`
          : '';
        bestCase = `Best-case non-Ford availability: ${bestShareAlt.model} has the highest budget fit among non-Ford SUVs (${bestShareAlt.qualify}/${bestShareAlt.total}, ${bestShareAlt.shareLabel}; median $${Math.round(cheapestMedAlt.median).toLocaleString()} for ${cheapestMedAlt.model}). Lowest-price qualifying non-Ford listing: ${bestListing.year} ${bestListing.model} in ${bestListing.state} at $${bestListing.price.toLocaleString()} with ${bestListing.miles.toLocaleString()} mi (${bestListing.condition}).${gapPart}${regPart}`;
      }

      const verifiedFacts = [
        { id: 'pool_total', label: 'Filtered pool count', value: pool.length },
        { id: 'eligible_total', label: 'Listings at or below budget', value: elig.length },
        { id: 'non_ford_eligible', label: 'Non-Ford listings in budget', value: nonFordElig.length },
        { id: 'ford_eligible', label: 'Ford Escape listings in budget', value: fordElig },
        { id: 'at_cap', label: 'Listings exactly at cap', value: atCapCount },
        { id: 'budget', label: 'Budget cap (USD)', value: state.budget },
      ];
      if (budgetDelta != null) {
        verifiedFacts.push({ id: 'prev_budget', label: 'Previous budget cap (USD)', value: prevBudget });
        verifiedFacts.push({ id: 'budget_delta', label: 'Change in eligible count', value: budgetDelta });
      }
      spreads.forEach((s) => {
        verifiedFacts.push({
          id: 'model_' + s.model,
          label: `${s.model} in-budget share`,
          value: `${s.qualify}/${s.n} (${s.shareLabel})${s.median ? `, median $${Math.round(s.median).toLocaleString()}` : ''}`,
          qualify: s.qualify,
          total: s.n,
          median: s.median ? Math.round(s.median) : null,
        });
      });

      return {
        valid: true,
        source: D.meta.source,
        dateRange: D.meta.dateRange,
        isPreview: D.meta.isPreview,
        poolCount: pool.length,
        eligibleCount: elig.length,
        nonFordCount: nonFordElig.length,
        fordCount: fordElig,
        atCapCount,
        prevBudget,
        prevEligCount,
        budgetDelta,
        spreads,
        gaps,
        regAvail,
        bestShareAlt,
        cheapestMedAlt,
        bestListing,
        bestReg,
        bestGap,
        localCaption,
        bestCase,
        verifiedFacts,
      };
    }

    return {
      D,
      N,
      MODELS: L.model,
      REGIONS: L.region,
      CONDITIONS: L.condition,
      MILE_BANDS: L.mileBand,
      mileBandIndex,
      rowAt,
      validateFilters,
      filterPool,
      filterEligible,
      budgetShare,
      budgetCoverageByModel,
      priceSpreadByModel,
      medianByModelYear,
      matchedPriceGaps,
      regionalAvailability,
      conditionMix,
      fuelCost,
      buildVerifiedSummary,
      modelIdx,
      regionIdx,
      condIdx,
    };
  }

  const Core = { create, quantile, sortedCopy, mileBandIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
