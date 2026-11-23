/*
 * main.js -- shared filter bar, budget playback animation ($10k -> $20k in $2.5k steps / 1.5s),
 * validation warnings, theme switcher, trust strip, insights, limitations, methodology, and references.
 */
(function () {
  'use strict';
  const { D, core, fmt, shapeIconSvg, clamp } = UI;
  const $ = (id) => document.getElementById(id);

  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => (k === 'class' ? (el.className = v) : el.setAttribute(k, v)));
    [].concat(kids == null ? [] : kids).forEach((k) => el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
    return el;
  }

  function table(head, rows) {
    const t = h('table', { class: 'tbl' });
    t.appendChild(h('thead', {}, h('tr', {}, head.map((x, i) => h('th', i === 0 ? { class: 'left' } : {}, String(x))))));
    t.appendChild(h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', i === 0 ? { class: 'left' } : {}, String(c)))))));
    return h('div', { class: 'tbl-scroll' }, t);
  }

  // ---------- Trust strip & preview notice ----------
  const trustBar = $('trust-bar');
  trustBar.append(
    h('span', {}, ['Data source: ', h('strong', {}, D.meta.source)]),
    h('span', {}, ['Listing dates: ', h('strong', {}, D.meta.dateRange)]),
    h('span', {}, ['Sample size: ', h('strong', {}, `${fmt.n(D.meta.rows)} listings across ${D.meta.statesCount} states/DC`)])
  );
  if ($('act1-dates')) $('act1-dates').textContent = D.meta.dateRange;
  if ($('v7-missing-count')) {
    $('v7-missing-count').textContent = `${fmt.n(D.meta.missingConditionCount)} of ${fmt.n(D.meta.rows)} listings`;
  }
  if (D.meta.isPreview) {
    const pb = $('preview-banner');
    pb.hidden = false;
    pb.textContent = 'Calibrated preview dataset active (reproduces all proposal benchmark counts: 1,633 total, 277 at $15,000, 148 non-Ford, Escape 129/476, Equinox 81/345). Drop the raw Kaggle CSVs into data/ or data/raw/ and run prepare_data.py to swap in the full raw files.';
  }

  // ---------- Model chips & focus selector ----------
  const chipsBox = $('model-chips');
  const focusSel = $('f-focus');
  D.levels.model.forEach((m) => focusSel.appendChild(h('option', { value: m }, m)));
  focusSel.onchange = () => State.setFocusModel(focusSel.value);

  function renderModelControls() {
    chipsBox.textContent = '';
    D.levels.model.forEach((m) => {
      const active = State.s.models.includes(m);
      const btn = h('button', {
        type: 'button',
        class: 'chip' + (active ? '' : ' off'),
        'aria-pressed': active ? 'true' : 'false',
        title: active ? `Hide ${m}` : `Show ${m}`,
      }, [shapeIconSvg(m), UI.shortModel(m)]);
      btn.onclick = () => State.toggleModel(m);
      chipsBox.appendChild(btn);
    });
    focusSel.value = State.s.focusModel;
  }

  // ---------- Filter inputs ----------
  const budgetSlider = $('f-budget');
  const budgetNum = $('f-budget-num');
  const yMinIn = $('f-year-min');
  const yMaxIn = $('f-year-max');
  const mMinIn = $('f-mile-min');
  const mMaxIn = $('f-mile-max');
  const regSel = $('f-region');

  budgetSlider.oninput = () => State.set({ budget: clamp(Number(budgetSlider.value), 0, 60000), animPlaying: false });
  budgetNum.onchange = () => State.set({ budget: clamp(Number(budgetNum.value) || 0, 0, 60000), animPlaying: false });

  function updateYear() {
    State.set({
      yearMin: Number(yMinIn.value) || 2016,
      yearMax: Number(yMaxIn.value) || 2019,
    });
  }
  function updateMile() {
    State.set({
      mileMin: Number(mMinIn.value) || 0,
      mileMax: mMaxIn.value === '' ? 125000 : Number(mMaxIn.value),
    });
  }
  yMinIn.onchange = updateYear;
  yMaxIn.onchange = updateYear;
  mMinIn.onchange = updateMile;
  mMaxIn.onchange = updateMile;
  regSel.onchange = () => State.set({ region: regSel.value || null });

  function syncFilterBar() {
    const s = State.s;
    budgetSlider.value = clamp(s.budget, 0, 35000);
    budgetNum.value = s.budget;
    yMinIn.value = s.yearMin;
    yMaxIn.value = s.yearMax;
    mMinIn.value = s.mileMin;
    mMaxIn.value = s.mileMax;
    regSel.value = s.region || '';

    const v = State.validation();
    const warn = $('filter-warn');
    if (!v.ok) {
      warn.hidden = false;
      warn.textContent = v.error;
      $('match-count').textContent = 'Invalid filter range';
      return;
    }
    warn.hidden = true;
    warn.textContent = '';

    const pool = State.poolIdx();
    const elig = State.eligibleIdx();
    $('match-count').textContent = pool.length
      ? `${fmt.n(elig.length)} of ${fmt.n(pool.length)} in budget`
      : 'No listings match';
  }

  // ---------- Budget animation ($10,000 -> $20,000 in $2,500 steps every 1.5s) ----------
  const ANIM_STEPS = [10000, 12500, 15000, 17500, 20000];
  let animTimer = 0;
  const playBtn = $('anim-play');
  const stepBtn = $('anim-step');
  const backBtn = $('anim-back');

  function stopAnim() {
    if (animTimer) { clearInterval(animTimer); animTimer = 0; }
    if (State.s.animPlaying) State.set({ animPlaying: false });
    playBtn.textContent = 'Play $10k–$20k';
    playBtn.setAttribute('aria-pressed', 'false');
  }

  function stepBudgetBy(delta) {
    stopAnim();
    State.set({ budget: clamp(State.s.budget + delta, 0, 60000) });
  }

  playBtn.onclick = () => {
    if (animTimer) {
      stopAnim();
      return;
    }
    if (UI.reducedMotion()) {
      const idx = ANIM_STEPS.findIndex((v) => v > State.s.budget);
      State.set({ budget: idx >= 0 ? ANIM_STEPS[idx] : ANIM_STEPS[0] });
      return;
    }
    State.set({ budget: ANIM_STEPS[0], animPlaying: true });
    playBtn.textContent = 'Pause';
    playBtn.setAttribute('aria-pressed', 'true');
    animTimer = setInterval(() => {
      const cur = State.s.budget;
      const nextIdx = ANIM_STEPS.indexOf(cur) + 1;
      if (nextIdx >= ANIM_STEPS.length) {
        stopAnim();
      } else {
        State.set({ budget: ANIM_STEPS[nextIdx] });
      }
    }, 1500);
  };

  stepBtn.onclick = () => stepBudgetBy(2500);
  backBtn.onclick = () => stepBudgetBy(-2500);

  $('anim-controls').addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); stepBudgetBy(2500); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); stepBudgetBy(-2500); }
  });

  $('reset-all').onclick = () => {
    stopAnim();
    State.resetAll();
  };

  State.on(['models', 'focusModel', 'year', 'mile', 'region', 'budget', 'anim'], () => {
    renderModelControls();
    syncFilterBar();
    renderInsights();
  });

  // ---------- Theme toggle ----------
  const root = document.documentElement;
  const tb = $('theme-btn');
  const isDark = () => root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const themeLabel = () => { tb.textContent = isDark() ? 'Light theme' : 'Dark theme'; };
  tb.onclick = () => { root.dataset.theme = isDark() ? 'light' : 'dark'; themeLabel(); State.themeChanged(); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { themeLabel(); State.themeChanged(); });
  themeLabel();

  // ---------- Dynamic Insights ----------
  function renderInsights() {
    const insEl = $('insights');
    insEl.textContent = '';
    const sum = core.buildVerifiedSummary({
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

    if (!sum.valid || !sum.poolCount) {
      insEl.appendChild(h('div', { class: 'insight' }, [
        h('h4', {}, 'No matching cohort'),
        h('p', {}, sum.localCaption),
      ]));
      return;
    }

    const esc = sum.spreads.find((r) => r.model === 'Ford Escape');
    const eqx = sum.spreads.find((r) => r.model === 'Chevrolet Equinox');
    const crv = sum.spreads.find((r) => r.model === 'Honda CR-V');
    const rav = sum.spreads.find((r) => r.model === 'Toyota RAV4');
    const bestAlt = sum.bestShareAlt;

    const cards = [
      [
        `Budget fit at ${fmt.usd(State.s.budget)}`,
        `${fmt.n(sum.eligibleCount)} of ${fmt.n(sum.poolCount)} matching listings qualify (${((100 * sum.eligibleCount) / sum.poolCount).toFixed(1)}%), ` +
        `including ${fmt.n(sum.nonFordCount)} non-Ford alternatives (${fmt.n(sum.atCapCount)} priced exactly at the cap).`,
      ],
      [
        'Escape vs. Equinox availability',
        esc && eqx
          ? `Ford Escape fits ${esc.qualify}/${esc.n} (${esc.shareLabel}) vs. Chevrolet Equinox at ${eqx.qualify}/${eqx.n} (${eqx.shareLabel}). ` +
            (bestAlt ? `${bestAlt.model} leads non-Ford share under these filters.` : '')
          : sum.localCaption,
      ],
      [
        'Matched year & mileage price gaps',
        sum.bestGap
          ? `Comparing identical model years and 25,000-mile bands (≥${State.s.gapMinN}/side), ${sum.bestGap.model} is ${fmt.usdSigned(Math.round(sum.bestGap.gap))} vs. Escape across ${sum.bestGap.strataCount} strata` +
            (crv && rav ? `, while CR-V (median ${fmt.usd(crv.median)}) and RAV4 (median ${fmt.usd(rav.median)}) carry higher asking-price premiums.` : '.')
          : 'No non-Escape model meets the matched sample threshold under the current filters.',
      ],
      [
        'Best-case trade-off for shoppers',
        sum.bestCase,
      ],
    ];
    cards.forEach(([t, p]) => insEl.appendChild(h('div', { class: 'insight' }, [h('h4', {}, t), h('p', {}, p)])));
  }

  // ---------- Limitations ----------
  const cgDateDesc = D.secondSource && D.secondSource.dateLabel ? D.secondSource.dateLabel : 'Sep 2020';
  const limits = [
    `All figures reflect historical asking prices from online classifieds (${D.meta.dateRange} Craigslist and ${cgDateDesc} CarGurus), not negotiated final sale prices or current dealership stock.`,
    `${fmt.n(D.meta.missingConditionCount)} of ${fmt.n(D.meta.rows)} listings omit seller-reported condition and are explicitly retained as "Unknown" rather than imputed.`,
    `${fmt.n(D.meta.missingVinCount)} listings lack a valid 17-character VIN; repeat listing IDs and duplicate VINs were removed, but a VIN-less vehicle could still appear more than once.`,
    'Model-year profiles (2016–2019) compare different vehicles in one cross-sectional snapshot, not the same vehicle tracked across years.',
    'Trim level, AWD vs. FWD drivetrain, accident history, and repair needs are unmeasured and explain part of any remaining price gap.',
    'CarGurus (Mital) lacks a comparable title_status column, so the second-source table also reports Craigslist without the clean-title filter.',
  ];
  limits.forEach((t) => $('limits').appendChild(h('li', {}, t)));

  // ---------- Method & References ----------
  const M = $('method');
  const sec = (title, body, open) => M.appendChild(h('details', open ? { open: '' } : {}, [h('summary', {}, title)].concat(body)));

  sec('1. Data sources, schema, and units', [
    h('p', {}, [
      'Primary snapshot: ',
      h('a', { href: D.meta.sourceUrl, target: '_blank', rel: 'noopener' }, D.meta.source),
      `. Dates span ${D.meta.dateRange} across ${D.meta.statesCount} states/DC. `,
      'Second-source check: ',
      h('a', { href: D.meta.secondSourceUrl, target: '_blank', rel: 'noopener' }, `Ananay Mital Kaggle (CarGurus ${cgDateDesc})`),
      '.',
    ]),
    table(['Field', 'Unit / values', 'Views used'], [
      ['model', '5 standardized compact SUVs (no Rogue Sport / Hybrid / EV)', 'Views 1–5, 9'],
      ['price', 'Asking price in USD ($2,000–$60,000)', 'Views 1–7, 9'],
      ['year, miles', 'Model year (2016–2019), odometer miles (0–125,000)', 'Views 3–5, 9'],
      ['state, region, posted_date', 'U.S. state, 4 Census regions, YYYY-MM-DD', 'Views 6, 9'],
      ['condition, has_vin', '7 categories incl. Unknown; VIN presence flag', 'Views 7, 9'],
      ['mpg, annual miles, fuel price', 'mi/gal (5–100), mi/yr (0–30k), $/gal ($0–$10)', 'View 8'],
    ]),
  ]);

  sec('2. Cleaning funnel and sensitivity checks', [
    table(['Step', 'Rows remaining', 'Removed', 'Rule'], D.meta.cleaning.map((c) => [c.step, fmt.n(c.rows_after), fmt.n(c.rows_removed), c.why])),
    h('p', {}, `Minimum price sensitivity check: relaxing the $2,000 floor down to $500 yields ${fmt.n(D.meta.minPriceSensitivity.min500Count)} rows vs ${fmt.n(D.meta.minPriceSensitivity.min2000Count)} rows (+${fmt.n(D.meta.minPriceSensitivity.min500Count - D.meta.minPriceSensitivity.min2000Count)} likely placeholder/parts ads).`),
  ]);

  sec('3. Sample cleaned records (public row keys)', [
    table(['Row key', 'Model', 'Year', 'Miles', 'Price', 'State', 'Region', 'Posted', 'Condition'],
      (D.sample.clean || []).map((r) => [r.row_key, r.model, r.year, fmt.n(r.miles), fmt.usd(r.price), r.state, r.region, r.posted_date, r.condition])),
  ]);

  if (window.VERIFY) {
    sec(`4. Verification (${VERIFY.passed} of ${VERIFY.total} independent pandas vs. core.js checks passed)`, [
      table(['ID', 'Type', 'Check', 'Expected', 'App actual', 'Result'],
        VERIFY.results.map((c) => [c.id, c.kind, c.desc, JSON.stringify(c.expected), JSON.stringify(c.actual), c.ok ? 'PASS' : 'FAIL'])),
    ]);
  }

  sec('5. Team roles and local setup', [
    h('p', {}, 'Danny Munoz (Views 1–4, shared controls), Karina Ponze (data prep, View 5, checks), Bobbi Perry (Views 6–7, pilot evaluation), Braulio Encarnacion (Views 8–9, Gemini chart explainer, backup demo).'),
    h('pre', {}, 'python prepare_data.py   # builds data/processed/* and data.js\npython verify.py         # runs 25 independent pandas vs core.js checks\npython server.py         # serves app + private Gemini AI /api/explain endpoint\npython -m http.server    # static offline mode (local verified captions)'),
  ]);

  sec('6. Project 1 → Project 2 Improvements (Table II)', [
    table(['Artifact / feedback & limitation', 'Planned improvement', 'Evidence of success', 'Owner'], [
      ['A1. Age curve may read like same car over time', 'Compare different cars from similar model years & 25k-mile bands', 'Separate checks reproduce medians & gaps; viewers explain model-year axis', 'Karina Ponze'],
      ['F1 & F2. Ford-only view lacked U.S. cross-make comparison', 'Compare 5 U.S. compact SUVs under shared filters + second source', 'Source dates, counts, and filters visible; shoppers find alternatives', 'Karina Ponze'],
      ['A2. Overlapping 3D points hard to inspect', 'Link 2D mileage–price view directly to listing shortlist table', 'Viewer selects a point & finds the exact record via mouse or keyboard', 'Danny Munoz'],
      ['A3. Ford prediction errors lacked cross-model gap evidence', 'Show counts + matched strata and let AI explain verified results', 'Correct values & captions in normal, empty, zero-cap, and invalid cases', 'Braulio Encarnacion'],
      ['F1. Midterm could not test alternative-car shopping task', 'Run 5-person pilot with Wang et al. trust inventory & revise unclear labels', 'At least 4 of 5 find a non-Ford option and explain a trade-off unaided', 'Bobbi Perry'],
      ['A1–A3. Walkthrough focused on Ford alone', 'Tell one connected story from budget change to listing & fuel check', 'All 4 members speak within assigned time with backup recording ready', 'Bobbi Perry'],
    ]),
  ]);

  const refItems = [
    ['[1] D. Munoz, "How fast does a used Ford lose its value?" Project 1 baseline & aesthetic reference.', 'https://ildannyli.github.io/fordstorywkaggle/'],
    ['[2] A. Quku, "Ford Car Price Prediction," Kaggle dataset (Project 1 source).', 'https://www.kaggle.com/datasets/adhurimquku/ford-car-price-prediction'],
    ['[3] A. Reese, "Used Cars Dataset," Kaggle v10 (Craigslist primary source).', 'https://www.kaggle.com/datasets/austinreese/craigslist-carstrucks-data'],
    ['[4] A. Mital, "US Used cars dataset," Kaggle v1 (CarGurus Sep 2020 second source).', 'https://www.kaggle.com/datasets/ananaymital/us-used-cars-dataset'],
    ['[5] A. Desai, "100,000 UK Used Car Data Set," Kaggle (comparative multi-make reference).', 'https://www.kaggle.com/datasets/adityadesai13/used-car-dataset-ford-and-mercedes'],
    ['[6] A. Muthukumar, "Cars Dataset (Audi, BMW, Ford, Hyundai, Skoda, VW)," Kaggle.', 'https://www.kaggle.com/datasets/aishwaryamuthukumar/cars-dataset-audi-bmw-ford-hyundai-skoda-vw'],
    ['[7] CarGurus, "Used car price trends: CarGurus pricing index."', 'https://www.cargurus.com/research/price-trends'],
    ['[8] CarGurus, "What\'s my car worth?" CarGurus car valuation reference.', 'https://www.cargurus.com/research/car-valuation'],
    ['[9] J. Kim, A. L. Chinni, K. B. Schloss, and M. Gleicher, "Divided attention amplifies the importance of expectation-aligned visualization design," IEEE VIS 2026.', 'https://ieeevis.org/year/2026/program/content/697bbf3e-0027-400e-aed4-9e2cf08a1047/'],
    ['[10] H. W. Wang et al., "Do you \'trust\' this visualization? An inventory to measure trust in visualizations," IEEE TVCG / VIS 2026.', 'https://ieeevis.org/year/2026/program/content/df4047c2-fb36-40bb-b522-1d213c6b1d84/'],
    ['[11] M. Engers, M. Hartmann, and S. Stern, "Annual miles drive used car prices," Journal of Applied Econometrics, 2009.', 'https://doi.org/10.1002/jae.1034'],
    ['[12] M. Prieto, B. Caemmerer, and G. Baltas, "Using a hedonic price model to test prospect theory assertions," Journal of Retailing and Consumer Services, 2015.', 'https://doi.org/10.1016/j.jretconser.2014.08.013'],
    ['[13] U.S. Census Bureau, "Geographies / Census Regions."', 'https://www.census.gov/data/data-tools/survey-explorer/geo.html'],
    ['[14] U.S. DOE / EPA, "Download Fuel Economy Data," FuelEconomy.gov.', 'https://www.fueleconomy.gov/feg/download.shtml'],
    ['[15] Live Motion Labs, Parameter-driven animation reference.', 'https://unit12-live-motion-labs.vercel.app/'],
    ['[16] Google Gemini API Structured Outputs documentation.', 'https://aistudio.google.com/docs/structured-output'],
  ];
  const ul = h('ul', { class: 'ref-list' });
  refItems.forEach(([txt, url]) => {
    ul.appendChild(h('li', {}, [txt + ' ', h('a', { href: url, target: '_blank', rel: 'noopener' }, url)]));
  });
  sec('7. References and data citations', [ul]);

  renderModelControls();
  syncFilterBar();
  renderInsights();
})();
