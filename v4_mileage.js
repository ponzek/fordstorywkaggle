/*
 * v4_mileage.js -- View 4: 2D Mileage vs. Asking Price scatter linked to exact records in View 9.
 * Highlights in-budget points, flashes newly eligible points when budget increases,
 * dims points outside an active View 5 stratum or View 7 condition, and clips/labels outliers cleanly.
 */
(function () {
  'use strict';
  const { D, core, tokens, modelColor, shapePath, shapeIconSvg, fmt, tip, watch, svg, clamp } = UI;
  const $ = (id) => document.getElementById(id);
  const host = $('v4-chart');
  let width = 0;
  let scope = 'focus'; // 'focus' | 'all'

  $('v4-scope-focus').onclick = () => {
    scope = 'focus';
    $('v4-scope-focus').setAttribute('aria-pressed', 'true');
    $('v4-scope-all').setAttribute('aria-pressed', 'false');
    render();
  };
  $('v4-scope-all').onclick = () => {
    scope = 'all';
    $('v4-scope-focus').setAttribute('aria-pressed', 'false');
    $('v4-scope-all').setAttribute('aria-pressed', 'true');
    render();
  };

  function render() {
    if (!width) return;
    const T = tokens();
    const sState = State.s;
    const val = State.validation();
    const pool = State.poolIdx();

    const H = clamp(Math.round(width * 0.42), 300, 420);
    const m = { l: 58, r: 22, t: 18, b: 42 };
    const s = svg(host, width, H);
    s.attr('aria-label', 'Scatter plot of odometer miles against asking price in USD');

    if (!val.ok || !sState.models.length || !pool.length) {
      s.append('text').attr('x', width / 2).attr('y', H / 2).attr('text-anchor', 'middle')
        .text(!val.ok ? val.error : 'No listings match');
      $('v4-sub').textContent = !val.ok ? val.error : 'No listings match';
      $('v4-legend').textContent = '';
      return;
    }

    const rows = [];
    for (let j = 0; j < pool.length; j++) {
      const r = core.rowAt(pool[j]);
      if (scope === 'focus' && r.model !== sState.focusModel) continue;
      rows.push(r);
    }

    const PMAX = 40000;
    let clipped = 0;
    rows.forEach((r) => { if (r.price > PMAX) clipped++; });

    const x = d3.scaleLinear([0, 125000], [m.l, width - m.r]);
    const y = d3.scaleLinear([0, PMAX], [H - m.b, m.t]);

    s.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(-(width - m.l - m.r)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d) => (d === 0 ? '0' : (d / 1000) + 'k')))
      .call((g) => g.selectAll('text').attr('dy', '1.2em'));
    s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8).tickFormat((d) => fmt.usdK(d)))
      .call((g) => g.select('.domain').remove());

    s.append('text').attr('class', 'axis-title').attr('x', m.l + (width - m.l - m.r) / 2).attr('y', H - 6)
      .attr('text-anchor', 'middle').text('Odometer (mi)');
    s.append('text').attr('class', 'axis-title').attr('transform', `translate(14,${(m.t + H - m.b) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle').text('Asking price (USD)');

    // Active mileage range window if narrowed below 0..125,000
    if (sState.mileMin > 0 || sState.mileMax < 125000) {
      s.append('rect')
        .attr('x', x(sState.mileMin)).attr('width', Math.max(2, x(sState.mileMax) - x(sState.mileMin)))
        .attr('y', m.t).attr('height', H - m.b - m.t)
        .attr('fill', T.ink3).attr('opacity', 0.08);
    }

    // Active stratum highlight shading if selected in View 5
    if (sState.activeStratum) {
      const b = sState.activeStratum.band;
      const bLo = b * 25000;
      const bHi = (b + 1) * 25000;
      s.append('rect')
        .attr('x', x(bLo)).attr('width', Math.max(2, x(bHi) - x(bLo)))
        .attr('y', m.t).attr('height', H - m.b - m.t)
        .attr('fill', T.s[0]).attr('opacity', 0.08);
    }

    // Budget cap line
    const budget = sState.budget;
    const prev = sState.prevBudget;
    const by = y(clamp(budget, 0, PMAX));
    s.append('line')
      .attr('x1', m.l).attr('x2', width - m.r).attr('y1', by).attr('y2', by)
      .attr('stroke', T.budget).attr('stroke-width', 2).attr('stroke-dasharray', '5 4');
    s.append('text')
      .attr('x', m.l + 8).attr('y', Math.max(m.t + 12, by - 6))
      .attr('fill', T.budget).style('font-weight', '650')
      .text(`Budget cap ${fmt.usd(budget)}`);

    const g = s.append('g');
    let inCount = 0;
    let newlyElig = 0;

    rows.forEach((r) => {
      const isIn = r.price <= budget;
      if (isIn) inCount++;
      const isNew = prev != null && prev < budget && r.price > prev && r.price <= budget;
      if (isNew) newlyElig++;
      const matchesStratum = !sState.activeStratum || (r.year === sState.activeStratum.year && core.mileBandIndex(r.miles) === sState.activeStratum.band);
      const matchesCond = !sState.condition || r.condition === sState.condition;
      const isSelected = sState.selectedRowKey === r.key;

      const py = y(Math.min(r.price, PMAX));
      const px = x(r.miles);
      const col = modelColor(r.model);
      const op = isSelected ? 1 : (!matchesStratum || !matchesCond) ? 0.14 : isIn ? 0.88 : 0.24;

      if (isNew || isSelected) {
        g.append('circle')
          .attr('cx', px).attr('cy', py).attr('r', isSelected ? 9 : 7)
          .attr('fill', 'none')
          .attr('stroke', isSelected ? T.ink : T.s[2])
          .attr('stroke-width', isSelected ? 2.4 : 1.6);
      }

      const pt = g.append('path')
        .attr('class', 'mark-hit')
        .attr('tabindex', scope === 'focus' || isIn || isSelected ? '0' : null)
        .attr('role', 'button')
        .attr('aria-label', `${r.year} ${r.model}, ${fmt.mi(r.miles)}, ${fmt.usd(r.price)}, ${r.state}${isIn ? '' : ', over budget'}`)
        .attr('d', shapePath(UI.modelShape(r.model), isSelected ? 5.2 : 3.4))
        .attr('transform', `translate(${px},${py})`)
        .attr('fill', col)
        .attr('fill-opacity', op)
        .attr('stroke', isIn ? T.surface : 'none')
        .attr('stroke-width', 0.8);

      const pick = () => {
        State.selectRow(r.key, { focusModel: false });
        const v9 = document.getElementById('v9');
        if (v9 && !UI.reducedMotion()) v9.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };

      pt.on('click', pick)
        .on('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } })
        .on('pointermove', (ev) => {
          tip.show(ev, `${r.year} ${r.model} (${r.key})`, [
            { color: col, label: 'Asking price', value: fmt.usd(r.price) + (isIn ? ' (in budget)' : ' (over budget)') },
            { label: 'Odometer', value: fmt.mi(r.miles) },
            { label: 'Location & date', value: `${r.state} (${r.region}) · ${r.date}` },
            { label: 'Reported condition', value: r.condition },
          ]);
        })
        .on('pointerleave', () => tip.hide());
    });

    const scopeName = scope === 'focus' ? sState.focusModel : 'all selected models';
    const clipText = clipped ? ` · ${clipped} above $40k clipped at top edge` : '';
    const newText = newlyElig ? ` · ${newlyElig} newly in budget` : '';
    $('v4-sub').textContent = `${fmt.n(rows.length)} listings (${scopeName}), ${fmt.n(inCount)} within ${fmt.usd(budget)}${newText}${clipText}`;

    const lg = $('v4-legend');
    lg.textContent = '';
    const shownModels = scope === 'focus' ? [sState.focusModel] : sState.models;
    shownModels.forEach((mod) => {
      const sp = document.createElement('span');
      sp.appendChild(shapeIconSvg(mod));
      sp.append(mod);
      lg.appendChild(sp);
    });
    const noteSp = document.createElement('span');
    noteSp.textContent = ' · Bright = within budget, Muted = over budget';
    lg.appendChild(noteSp);
  }

  State.on(['models', 'focusModel', 'year', 'mile', 'region', 'budget', 'activeStratum', 'selectedRowKey', 'condition', 'theme'], render);
  watch(host, (w) => { width = w; render(); });
})();
