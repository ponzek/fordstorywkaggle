/*
 * explainer.js -- Gemini AI Chart Explainer & Best-Case Scenario controller.
 * Sends the verified chart summary + filter snapshot to the small local Flask server (/api/explain),
 * checks that returned cited facts match the current chart, drops stale answers on filter change,
 * and falls back cleanly to a verified local caption + best-case scenario whenever Gemini is offline.
 */
(function () {
  'use strict';
  const { core, fmt } = UI;
  const $ = (id) => document.getElementById(id);

  let serverOnline = false;
  let geminiConfigured = false;
  let openaiConfigured = false;
  let activeModelLabel = '';
  let lastRequestToken = null;

  const VIEW_TITLES = {
    v1: 'View 1: Budget coverage',
    v2: 'View 2: Asking-price spread',
    v3: 'View 3: Price by model year',
    v4: 'View 4: Mileage vs. asking price',
    v5: 'View 5: Matched price gaps vs. Ford Escape',
    v6: 'View 6: Regional availability',
    v7: 'View 7: Listed condition mix',
    v8: 'View 8: Fuel-cost scenario',
    v9: 'View 9: Historical listing shortlist',
  };

  async function checkHealth() {
    const badge = $('ai-mode-badge');
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      serverOnline = true;
      geminiConfigured = Boolean(data.geminiConfigured);
      openaiConfigured = Boolean(data.openaiConfigured);
      if (geminiConfigured && openaiConfigured) {
        activeModelLabel = `${data.model} + ${data.openaiModel} fallback`;
        badge.textContent = `AI ready: Gemini (${data.model}) + OpenAI (${data.openaiModel})`;
      } else if (geminiConfigured) {
        activeModelLabel = data.model || 'gemini';
        badge.textContent = `Gemini API ready (${activeModelLabel})`;
      } else if (openaiConfigured) {
        activeModelLabel = data.openaiModel || 'gpt-4o-mini';
        badge.textContent = `OpenAI API ready (${activeModelLabel})`;
      } else {
        badge.textContent = 'Server online · Local verified mode (no API key in .env)';
      }
    } catch (_) {
      serverOnline = false;
      geminiConfigured = false;
      openaiConfigured = false;
      badge.textContent = 'Static offline mode · Local verified captions';
    }
  }

  function currentSummary() {
    return core.buildVerifiedSummary({
      budget: State.s.budget,
      models: State.s.models,
      focusModel: State.s.focusModel,
      yearMin: State.s.yearMin,
      yearMax: State.s.yearMax,
      mileMin: State.s.mileMin,
      mileMax: State.s.mileMax,
      region: State.s.region,
      gapMinN: State.s.gapMinN,
    }, State.s.prevBudget);
  }

  function renderLocal(summary, statusMsg) {
    const viewName = VIEW_TITLES[State.s.activeView] || 'Current view';
    $('ai-context-label').textContent = `Current context: ${viewName} · ${fmt.usd(State.s.budget)} cap · ${State.s.focusModel}`;
    $('ai-out-headline').textContent = 'Verified chart summary';
    $('ai-out-what').textContent = summary.localCaption;
    $('ai-out-tradeoff').textContent = summary.valid && summary.eligibleCount
      ? `Showing ${fmt.n(summary.eligibleCount)} qualifying listings out of ${fmt.n(summary.poolCount)} filtered compact SUVs (${fmt.n(summary.nonFordCount)} non-Ford).`
      : '';
    $('ai-out-best').textContent = summary.bestCase;
    $('ai-out-caveat').textContent = 'Asking prices only from historical listings; actual sale prices, trim options, and repair needs are unmeasured.';

    const factsUl = $('ai-out-facts');
    factsUl.textContent = '';
    (summary.verifiedFacts || []).slice(0, 5).forEach((f) => {
      const li = document.createElement('li');
      li.textContent = `${f.label}: ${typeof f.value === 'number' ? fmt.n(f.value) : f.value}`;
      factsUl.appendChild(li);
    });

    $('ai-meta').textContent = statusMsg || ((geminiConfigured || openaiConfigured)
      ? `Click "Ask Explainer" or any prompt button above to generate a live AI explanation (${activeModelLabel}) verified against these exact numbers.`
      : 'Running deterministic verified summary built directly from current chart values.');
  }

  /**
   * Build the set of supported dollar numbers present in the current chart summary
   * so any ungrounded dollar claim from Gemini triggers the verified local fallback.
   */
  function allowedDollars(summary) {
    const nums = new Set([0, 2000, 2500, 10000, 12500, 15000, 17500, 20000, 60000]);
    const add = (v) => {
      if (v != null && isFinite(v)) {
        nums.add(Math.round(v));
        nums.add(Math.round(Math.abs(v)));
      }
    };
    add(State.s.budget);
    add(State.s.prevBudget);
    if (State.s.fuel && isFinite(State.s.fuel.price)) {
      nums.add(Number(State.s.fuel.price.toFixed(2)));
      [20, 25, 30, State.s.fuel.customMpg].forEach((mpg) => {
        const res = core.fuelCost(State.s.fuel.miles, mpg, State.s.fuel.price);
        if (res.ok) add(res.annualDollars);
      });
    }
    (summary.spreads || []).forEach((s) => {
      add(s.median); add(s.q25); add(s.q75); add(s.min); add(s.max);
    });
    (summary.gaps || []).forEach((g) => add(g.gap));
    if (summary.bestListing) add(summary.bestListing.price);
    return nums;
  }

  /**
   * Verify Gemini structured output against current verifiedFacts & dollar values.
   * Rejects empty replies, unverified fact IDs, or unsupported dollar figures.
   */
  function verifyGeminiPayload(reply, summary) {
    if (!reply || typeof reply !== 'object') return false;
    if (!reply.headline || !reply.what_changed || !reply.best_case_scenario) return false;
    const validIds = new Set((summary.verifiedFacts || []).map((f) => f.id));
    if (Array.isArray(reply.cited_facts)) {
      for (const cid of reply.cited_facts) {
        if (!validIds.has(cid)) return false;
      }
    }
    const allowed = allowedDollars(summary);
    const text = [reply.headline, reply.what_changed, reply.best_case_scenario, reply.trade_off || ''].join(' ');
    const dollarRe = /\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)(k)?/gi;
    let m;
    while ((m = dollarRe.exec(text)) !== null) {
      let val = Number(m[1].replace(/,/g, ''));
      if (m[2]) val *= 1000;
      if (!allowed.has(val) && !allowed.has(Math.round(val))) return false;
    }
    return true;
  }

  async function askGemini(question) {
    const summary = currentSummary();
    if (!summary.valid) {
      renderLocal(summary, 'Fix the invalid filter range first.');
      return;
    }

    const token = State.tokenNow();
    lastRequestToken = token;

    if (!serverOnline || (!geminiConfigured && !openaiConfigured)) {
      renderLocal(summary, serverOnline
        ? 'No GEMINI_API_KEY or OPENAI_API_KEY is set in .env — showing verified local explanation and best-case scenario.'
        : 'Run `python server.py` with GEMINI_API_KEY (or OPENAI_API_KEY) in .env to enable live AI explanations (showing verified local fallback).');
      return;
    }

    $('ai-meta').textContent = 'Asking AI explainer and verifying against current chart numbers…';
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewId: State.s.activeView,
          viewTitle: VIEW_TITLES[State.s.activeView] || 'Current view',
          question,
          filters: {
            budget: State.s.budget,
            prevBudget: State.s.prevBudget,
            models: State.s.models,
            focusModel: State.s.focusModel,
            yearMin: State.s.yearMin,
            yearMax: State.s.yearMax,
            mileMin: State.s.mileMin,
            mileMax: State.s.mileMax,
            region: State.s.region || 'All U.S.',
            fuel: State.s.fuel,
          },
          summary: {
            source: summary.source,
            dateRange: summary.dateRange,
            poolCount: summary.poolCount,
            eligibleCount: summary.eligibleCount,
            nonFordCount: summary.nonFordCount,
            fordCount: summary.fordCount,
            atCapCount: summary.atCapCount,
            budgetDelta: summary.budgetDelta,
            prevBudget: summary.prevBudget,
            spreads: summary.spreads,
            gaps: summary.gaps.map((g) => ({ model: g.model, gap: g.gap != null ? Math.round(g.gap) : null, strataCount: g.strataCount })),
            bestListing: summary.bestListing,
            bestShareAlt: summary.bestShareAlt,
            cheapestMedAlt: summary.cheapestMedAlt,
            bestReg: summary.bestReg,
            verifiedFacts: summary.verifiedFacts,
          },
        }),
      });

      // Drop stale response if user changed filters while request was in flight
      if (token !== State.tokenNow() || token !== lastRequestToken) {
        return;
      }

      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data.ok || !verifyGeminiPayload(data.explanation, summary)) {
        renderLocal(summary, 'Gemini reply could not be verified against the current chart — showing verified local fallback.');
        return;
      }

      const ex = data.explanation;
      $('ai-out-headline').textContent = ex.headline;
      $('ai-out-what').textContent = ex.what_changed;
      $('ai-out-tradeoff').textContent = ex.trade_off || '';
      $('ai-out-best').textContent = ex.best_case_scenario;
      $('ai-out-caveat').textContent = ex.caveat || 'Historical asking prices only.';

      const factMap = new Map(summary.verifiedFacts.map((f) => [f.id, f]));
      const factsUl = $('ai-out-facts');
      factsUl.textContent = '';
      (ex.cited_facts || []).forEach((fid) => {
        const f = factMap.get(fid);
        if (!f) return;
        const li = document.createElement('li');
        li.textContent = `${f.label}: ${typeof f.value === 'number' ? fmt.n(f.value) : f.value}`;
        factsUl.appendChild(li);
      });

      const provLabel = data.provider === 'openai' ? 'OpenAI' : 'Gemini';
      $('ai-meta').textContent = `Verified ${provLabel} explanation (${data.model || 'AI'}) · grounded in ${summary.verifiedFacts.length} live chart facts.`;
    } catch (err) {
      if (token === State.tokenNow()) {
        renderLocal(summary, `Gemini request unavailable (${err.message}) — showing verified local fallback.`);
      }
    }
  }

  // Event wiring
  document.querySelectorAll('.explain-trigger').forEach((btn) => {
    btn.onclick = () => {
      const vid = btn.dataset.view || 'v1';
      State.set({ activeView: vid });
      const sec = $('ai-explainer');
      if (sec) sec.scrollIntoView({ behavior: UI.reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      askGemini(`Explain ${VIEW_TITLES[vid]} and highlight the best-case non-Ford option under the current filters.`);
    };
  });

  document.querySelectorAll('.ai-prompt').forEach((btn) => {
    btn.onclick = () => {
      $('ai-input').value = btn.dataset.q;
      askGemini(btn.dataset.q);
    };
  });

  $('ai-form').onsubmit = (ev) => {
    ev.preventDefault();
    const q = $('ai-input').value.trim() || 'Explain what this chart is saying and the best-case scenario.';
    askGemini(q);
  };

  $('ai-refresh-btn').onclick = () => {
    renderLocal(currentSummary());
  };

  $('open-ai-btn').onclick = () => {
    const sec = $('ai-explainer');
    if (sec) sec.scrollIntoView({ behavior: UI.reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    askGemini('Explain what the charts are saying right now and recommend the best-case non-Ford option.');
  };

  // Drop stale AI text immediately whenever filters change
  State.on(['models', 'focusModel', 'year', 'mile', 'region', 'budget', 'gapMinN', 'activeView'], () => {
    lastRequestToken = null;
    renderLocal(currentSummary());
  });

  checkHealth().then(() => renderLocal(currentSummary()));
})();
