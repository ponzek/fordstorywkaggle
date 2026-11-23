/*
 * ui.js -- shared reactive state, consistent model colors + shapes, USD/mi formatters,
 * tooltip, responsive SVG helpers, and budget playback state for all nine views.
 */
(function (root) {
  'use strict';

  const D = root.BEYOND_FORD;
  const core = root.Core.create(D);

  function tokens() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    return {
      surface: g('--surface'),
      page: g('--page'),
      ink: g('--ink'),
      ink2: g('--ink-2'),
      ink3: g('--ink-3'),
      grid: g('--grid'),
      axis: g('--axis'),
      budget: g('--budget'),
      s: [g('--s1'), g('--s2'), g('--s3')],
      models: [g('--m0'), g('--m1'), g('--m2'), g('--m3'), g('--m4')],
      pos: g('--pos'),
      neg: g('--neg'),
      good: g('--good-text'),
    };
  }

  const SHAPE_TYPES = ['circle', 'square', 'triangle', 'diamond', 'cross'];

  function modelSlot(model) {
    const idx = D.levels.model.indexOf(model);
    return idx >= 0 ? idx : 0;
  }

  function modelColor(model) {
    return tokens().models[modelSlot(model)];
  }

  function modelShape(model) {
    return SHAPE_TYPES[modelSlot(model)];
  }

  function shortModel(model) {
    return model
      .replace('Ford ', '')
      .replace('Chevrolet ', '')
      .replace('Honda ', '')
      .replace('Toyota ', '')
      .replace('Nissan ', '');
  }

  function shapePath(shape, r) {
    const d = r || 4.5;
    if (shape === 'square') return `M${-d},${-d}L${d},${-d}L${d},${d}L${-d},${d}Z`;
    if (shape === 'triangle') {
      const h = d * 1.15;
      return `M0,${-h}L${h},${h * 0.85}L${-h},${h * 0.85}Z`;
    }
    if (shape === 'diamond') {
      const h = d * 1.25;
      return `M0,${-h}L${h},0L0,${h}L${-h},0Z`;
    }
    if (shape === 'cross') {
      const a = d * 0.42, b = d * 1.15;
      return `M${-a},${-b}H${a}V${-a}H${b}V${a}H${a}V${b}H${-a}V${a}H${-b}V${-a}H${-a}Z`;
    }
    // circle path
    return `M0,${-d}A${d},${d},0,1,1,0,${d}A${d},${d},0,1,1,0,${-d}Z`;
  }

  function shapeIconSvg(model, color) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '-7 -7 14 14');
    s.setAttribute('width', '12');
    s.setAttribute('height', '12');
    s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', shapePath(modelShape(model), 5));
    p.setAttribute('fill', color || modelColor(model));
    s.appendChild(p);
    return s;
  }

  const f0 = d3.format(',.0f');
  const fmt = {
    usd: (x) => (x == null || !isFinite(x) ? '–' : '$' + f0(x)),
    usdSigned: (x) => (x == null || !isFinite(x) ? '–' : (x >= 0 ? '+$' : '−$') + f0(Math.abs(x))),
    usdK: (x) => (x == null || !isFinite(x) ? '–' : (x < 0 ? '−$' : '$') + (Math.abs(x) / 1000).toFixed(Math.abs(x) % 1000 === 0 ? 0 : 1) + 'k'),
    n: (x) => (x == null || !isFinite(x) ? '–' : f0(x)),
    mi: (x) => (x == null || !isFinite(x) ? '–' : f0(x) + ' mi'),
    pct: (x, dec) => (x == null || !isFinite(x) ? '–' : x.toFixed(dec == null ? 1 : dec) + '%'),
  };

  const tipEl = () => document.getElementById('tip');
  const tip = {
    show(evt, head, rows) {
      const el = tipEl();
      if (!el) return;
      el.textContent = '';
      if (head) {
        const h = document.createElement('div');
        h.className = 'th';
        h.textContent = head;
        el.appendChild(h);
      }
      (rows || []).forEach((r) => {
        const d = document.createElement('div');
        d.className = 'tr';
        if (r.color) {
          const k = document.createElement('i');
          k.style.borderColor = r.color;
          d.appendChild(k);
        }
        const l = document.createElement('span');
        l.textContent = r.label;
        d.appendChild(l);
        if (r.value != null) {
          const v = document.createElement('b');
          v.textContent = r.value;
          d.appendChild(v);
        }
        el.appendChild(d);
      });
      el.classList.add('on');
      const pad = 14;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let x = (evt.clientX || 200) + pad;
      let y = (evt.clientY || 200) + pad;
      if (x + w > window.innerWidth - 8) x = Math.max(8, (evt.clientX || 200) - w - pad);
      if (y + h > window.innerHeight - 8) y = Math.max(8, (evt.clientY || 200) - h - pad);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    },
    hide() {
      const el = tipEl();
      if (el) el.classList.remove('on');
    },
  };

  function watch(el, fn) {
    let raf = 0;
    let last = -1;
    const run = () => {
      raf = 0;
      const w = Math.floor(el.clientWidth);
      if (w > 0 && w !== last) {
        last = w;
        fn(w);
      }
    };
    new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(run); }).observe(el);
    run();
    return () => { last = -1; run(); };
  }

  function svg(container, w, h) {
    const sel = d3.select(container);
    sel.selectAll('*').remove();
    return sel.append('svg').attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img');
  }

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // ---------- shared application state ----------
  const defaults = () => ({
    budget: 15000,
    prevBudget: null,
    models: [...D.levels.model],
    focusModel: 'Ford Escape',
    yearMin: 2016,
    yearMax: 2019,
    mileMin: 0,
    mileMax: 125000,
    region: null,
    condition: null,
    gapMinN: 15,
    activeStratum: null, // { model, year, band, bandLabel }
    selectedRowKey: null,
    fuel: { miles: 12000, price: 3.50, customMpg: 25, carLabel: null },
    animPlaying: false,
    activeView: 'v1',
  });

  const S = defaults();
  const subs = [];
  let dirty = new Set();
  let queued = false;
  const idxCache = new Map();

  function flush() {
    queued = false;
    const keys = dirty;
    dirty = new Set();
    subs.forEach((s) => {
      if (s.keys.some((k) => keys.has(k))) s.fn([...keys]);
    });
  }

  function mark(keys) {
    keys.forEach((k) => dirty.add(k));
    if (!queued) {
      queued = true;
      requestAnimationFrame(flush);
    }
  }

  function cached(tag, opts) {
    const key = tag + JSON.stringify(opts);
    if (!idxCache.has(key)) {
      if (idxCache.size > 60) idxCache.clear();
      idxCache.set(key, core.filterPool(opts));
    }
    return idxCache.get(key);
  }

  const State = {
    s: S,
    core,
    on(keys, fn) { subs.push({ keys, fn }); },
    set(patch, tagList) {
      const keys = new Set(tagList || []);
      Object.keys(patch).forEach((k) => {
        if (S[k] !== patch[k]) {
          if (k === 'budget') S.prevBudget = S.budget;
          S[k] = patch[k];
          if (k === 'yearMin' || k === 'yearMax') keys.add('year');
          else if (k === 'mileMin' || k === 'mileMax') keys.add('mile');
          else keys.add(k);
        }
      });
      if (keys.size) mark([...keys]);
    },
    toggleModel(name) {
      const has = S.models.includes(name);
      S.models = has ? S.models.filter((m) => m !== name) : [...S.models, name];
      if (!S.models.includes(S.focusModel) && S.models.length) S.focusModel = S.models[0];
      mark(['models', 'focusModel']);
    },
    setFocusModel(name) {
      if (!D.levels.model.includes(name)) return;
      if (!S.models.includes(name)) S.models = [...S.models, name];
      S.focusModel = name;
      S.activeStratum = null;
      mark(['models', 'focusModel', 'activeStratum']);
    },
    selectRow(rowKey, opts) {
      S.selectedRowKey = rowKey;
      const idx = D.cols.key.indexOf(rowKey);
      if (idx >= 0) {
        const r = core.rowAt(idx);
        S.fuel = Object.assign({}, S.fuel, {
          customMpg: r.mpg,
          carLabel: `${r.year} ${r.model} (${r.state}, ${fmt.usd(r.price)})`,
        });
        if (opts && opts.focusModel) S.focusModel = r.model;
      }
      mark(['selectedRowKey', 'fuel', 'focusModel']);
    },
    resetAll() {
      const d = defaults();
      Object.assign(S, d);
      mark(['budget', 'models', 'focusModel', 'year', 'mile', 'region', 'condition', 'gapMinN', 'activeStratum', 'selectedRowKey', 'fuel', 'anim']);
    },
    validation() {
      return core.validateFilters({
        yearMin: S.yearMin,
        yearMax: S.yearMax,
        mileMin: S.mileMin,
        mileMax: S.mileMax,
      });
    },
    poolIdx() {
      return cached('pool', {
        models: S.models,
        yearMin: S.yearMin,
        yearMax: S.yearMax,
        mileMin: S.mileMin,
        mileMax: S.mileMax,
        region: S.region,
        condition: null, // Views 1-6 do not hide condition; View 7 highlights/filters View 9
      });
    },
    poolIdxNoRegion() {
      return cached('poolNoReg', {
        models: S.models,
        yearMin: S.yearMin,
        yearMax: S.yearMax,
        mileMin: S.mileMin,
        mileMax: S.mileMax,
        region: null,
        condition: null,
      });
    },
    poolIdxAllModels() {
      return cached('poolAllM', {
        models: D.levels.model,
        yearMin: S.yearMin,
        yearMax: S.yearMax,
        mileMin: S.mileMin,
        mileMax: S.mileMax,
        region: S.region,
        condition: null,
      });
    },
    eligibleIdx() {
      return core.filterEligible(this.poolIdx(), S.budget);
    },
    themeChanged() { mark(['theme']); },
    tokenNow() { return Date.now() + '|' + JSON.stringify([S.budget, S.models, S.yearMin, S.yearMax, S.mileMin, S.mileMax, S.region, S.focusModel, S.gapMinN]); },
  };

  root.UI = {
    D,
    core,
    tokens,
    modelSlot,
    modelColor,
    modelShape,
    shortModel,
    shapePath,
    shapeIconSvg,
    fmt,
    tip,
    watch,
    svg,
    reducedMotion,
    clamp,
  };
  root.State = State;
})(window);
