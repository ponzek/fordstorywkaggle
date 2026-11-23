/*
 * v1_budget.js -- View 1: Budget coverage step line (0-100% by USD) + second-source comparison panel.
 * Supports clicking/dragging on the chart to change budget, model tile clicks to focus Views 4 & 6,
 * and shows Reese Craigslist vs Mital CarGurus counts side by side.
 */
(function () {
  'use strict';
  const { D, core, tokens, modelColor, shapePath, shapeIconSvg, shortModel, fmt, tip, watch, svg, clamp } = UI;
  const $ = (id) => document.getElementById(id);
  const host = $('v1-chart');
  let width = 0;

  const STEPS = d3.range(2000, 35500, 500);

  function render() {
    if (!width) return;
    const T = tokens();
    const sState = State.s;
    const val = State.validation();
    const pool = State.poolIdx();
    const budget = sState.budget;
    const prev = sState.prevBudget;

    const H = clamp(Math.round(width * 0.36), 270, 360);
    const m = { l: 52, r: 94, t: 16, b: 40 };
    const s = svg(host, width, H);
    s.attr('aria-label', 'Step line chart of percentage of used compact SUV listings within budget');

    if (!val.ok || !sState.models.length || !pool.length) {
      s.append('text').attr('x', width / 2).attr('y', H / 2).attr('text-anchor', 'middle')
        .text(!val.ok ? val.error : 'No listings match these filters. Select a model or widen filters.');
      renderLegend([]);
      renderTiles([], pool.length);
      renderSecondSource();
      $('v1-status').textContent = !val.ok ? val.error : 'No listings match';
      return;
    }

    const curves = core.budgetCoverageByModel(pool, sState.models, STEPS);
    const x = d3.scaleLinear([2000, 35000], [m.l, width - m.r]);
    const y = d3.scaleLinear([0, 100], [H - m.b, m.t]);

    s.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(width - m.l - m.r)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(7).tickFormat((d) => fmt.usdK(d)))
      .call((g) => g.selectAll('text').attr('dy', '1.2em'));
    s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(8).tickFormat((d) => d + '%'))
      .call((g) => g.select('.domain').remove());

    s.append('text').attr('class', 'axis-title').attr('x', m.l + (width - m.l - m.r) / 2).attr('y', H - 6)
      .attr('text-anchor', 'middle').text('Budget cap (USD asking price)');
    s.append('text').attr('class', 'axis-title').attr('transform', `translate(14,${(m.t + H - m.b) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle').text('Listings within budget (%)');

    const line = d3.line().x((d) => x(d.budget)).y((d) => y(d.pct || 0)).curve(d3.curveStepAfter);

    const ends = [];
    curves.forEach((c) => {
      if (!c.total) return;
      const col = modelColor(c.model);
      const isFocus = c.model === sState.focusModel;
      s.append('path')
        .attr('d', line(c.points))
        .attr('fill', 'none')
        .attr('stroke', col)
        .attr('stroke-width', isFocus ? 2.6 : 1.7)
        .attr('stroke-opacity', isFocus ? 1 : 0.82);

      // Marker at current budget cap
      const qAt = core.filterEligible(
        core.filterPool({
          models: [c.model], yearMin: sState.yearMin, yearMax: sState.yearMax,
          mileMin: sState.mileMin, mileMax: sState.mileMax, region: sState.region,
        }),
        budget
      ).length;
      const pctAt = (100 * qAt) / c.total;
      const cx = x(clamp(budget, 2000, 35000));
      const cy = y(pctAt);
      s.append('path')
        .attr('d', shapePath(UI.modelShape(c.model), isFocus ? 5.5 : 4.5))
        .attr('transform', `translate(${cx},${cy})`)
        .attr('fill', col)
        .attr('stroke', T.surface)
        .attr('stroke-width', 1.6);

      ends.push({ model: c.model, y: y(c.points[c.points.length - 1].pct || 0), label: shortModel(c.model) });
    });

    // Direct right-edge labels (de-collided)
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) {
      ends[i].ly = Math.max(ends[i].y, (ends[i - 1].ly ?? ends[i - 1].y) + 14);
    }
    ends.forEach((e) => {
      s.append('text').attr('class', 'ink2')
        .attr('x', width - m.r + 8).attr('y', (e.ly ?? e.y) + 4)
        .style('font-weight', e.model === sState.focusModel ? '650' : '400')
        .text(e.label);
    });

    // Previous budget ghost line (when stepping/animating)
    if (prev != null && prev !== budget && prev >= 2000 && prev <= 35000) {
      s.append('line')
        .attr('x1', x(prev)).attr('x2', x(prev)).attr('y1', m.t).attr('y2', H - m.b)
        .attr('stroke', T.ink3).attr('stroke-width', 1).attr('stroke-dasharray', '2 3').attr('opacity', 0.6);
    }

    // Active budget cap dashed marker
    const bx = x(clamp(budget, 2000, 35000));
    s.append('line')
      .attr('x1', bx).attr('x2', bx).attr('y1', m.t).attr('y2', H - m.b)
      .attr('stroke', T.budget).attr('stroke-width', 2).attr('stroke-dasharray', '5 4');
    s.append('text')
      .attr('x', clamp(bx + 6, m.l + 4, width - m.r - 65)).attr('y', m.t + 12)
      .attr('fill', T.budget).style('font-weight', '650')
      .text(fmt.usd(budget) + ' cap');

    // Interactive hover + click-to-set-budget overlay
    const cross = s.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', T.ink3).style('display', 'none');
    s.append('rect')
      .attr('x', m.l).attr('y', m.t).attr('width', width - m.l - m.r).attr('height', H - m.t - m.b)
      .attr('fill', 'transparent').style('cursor', 'ew-resize')
      .on('pointermove', (ev) => {
        const [px] = d3.pointer(ev);
        const cap = Math.round(clamp(x.invert(px), 2000, 35000) / 500) * 500;
        cross.style('display', null).attr('x1', x(cap)).attr('x2', x(cap));
        const rows = curves.map((c) => {
          const pt = c.points.find((p) => p.budget === cap) || c.points[c.points.length - 1];
          return {
            color: modelColor(c.model),
            label: c.model,
            value: c.total ? `${pt.qualify}/${c.total} (${pt.pct.toFixed(1)}%)` : 'No listings match',
          };
        });
        tip.show(ev, `At ${fmt.usd(cap)} cap (click to apply)`, rows);
      })
      .on('pointerleave', () => { cross.style('display', 'none'); tip.hide(); })
      .on('click', (ev) => {
        const [px] = d3.pointer(ev);
        const cap = Math.round(clamp(x.invert(px), 2000, 35000) / 500) * 500;
        State.set({ budget: cap, animPlaying: false });
      });

    const totalElig = core.filterEligible(pool, budget).length;
    const prevElig = prev != null ? core.filterEligible(pool, prev).length : null;
    const deltaStr = prevElig != null && prev !== budget
      ? ` (${totalElig - prevElig >= 0 ? '+' : ''}${totalElig - prevElig} vs ${fmt.usd(prev)})`
      : '';
    $('v1-status').textContent = `${fmt.n(totalElig)} of ${fmt.n(pool.length)} listings qualify (${((100 * totalElig) / pool.length).toFixed(1)}%)${deltaStr}`;

    renderLegend(curves);
    renderTiles(curves, pool.length);
    renderSecondSource();
  }

  function renderLegend(curves) {
    const lg = $('v1-legend');
    lg.textContent = '';
    curves.forEach((c) => {
      const sp = document.createElement('span');
      sp.appendChild(shapeIconSvg(c.model));
      sp.append(c.model);
      lg.appendChild(sp);
    });
  }

  function renderTiles() {
    const box = $('v1-tiles');
    box.textContent = '';
    const sState = State.s;
    const pool = State.poolIdx();
    const spreads = core.priceSpreadByModel(pool, sState.models, sState.budget);
    spreads.forEach((sp) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile' + (sp.model === sState.focusModel ? ' focused' : '');
      tile.setAttribute('aria-pressed', sp.model === sState.focusModel ? 'true' : 'false');
      tile.onclick = () => State.setFocusModel(sp.model);

      const lab = document.createElement('div');
      lab.className = 't-label';
      lab.appendChild(shapeIconSvg(sp.model));
      lab.append(sp.model);

      const val = document.createElement('div');
      val.className = 't-value';
      val.textContent = sp.shareLabel;

      const sub = document.createElement('div');
      sub.className = 't-sub';
      sub.textContent = sp.n ? `${fmt.n(sp.qualify)} / ${fmt.n(sp.n)} ≤ ${fmt.usd(sState.budget)}` : 'No listings match';

      tile.append(lab, val, sub);
      box.appendChild(tile);
    });
  }

  function renderSecondSource() {
    const box = $('v1-second-source');
    box.textContent = '';
    const ss = D.secondSource;
    if (!ss || !ss.available) return;

    const b = State.s.budget;
    const cgStep = clamp(Math.round(b / 2500) * 2500, 5000, 35000);
    const head = document.createElement('p');
    head.className = 'panel-title';
    head.textContent = `Second-source comparison: ${D.meta.source} vs. ${ss.name} (active cap ${fmt.usd(b)})`;
    const sub = document.createElement('p');
    sub.className = 'panel-sub';
    sub.textContent = `${ss.dateLabel}. ${ss.note}`;
    box.append(head, sub);

    const tbl = document.createElement('table');
    tbl.className = 'tbl';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    [
      'Model',
      `Craigslist clean-title (${fmt.usd(b)})`,
      'Craigslist no-title baseline ($15,000)',
      `${ss.name} (${fmt.usd(cgStep)} step)`,
      'CarGurus median',
    ].forEach((t, i) => {
      const th = document.createElement('th');
      if (i === 0) th.className = 'left';
      th.textContent = t;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');
    const shownModels = State.s.models.length ? State.s.models : D.levels.model;
    const poolNow = State.poolIdx();
    const clSpreads = new Map(core.priceSpreadByModel(poolNow, shownModels, b).map((r) => [r.model, r]));
    const ntMap = new Map((D.meta.noCleanTitleByModel || []).map((r) => [r.model, r]));
    const cgMap = new Map(ss.models.map((r) => [r.model, r]));

    shownModels.forEach((m) => {
      const tr = document.createElement('tr');
      const cl = clSpreads.get(m);
      const nt = ntMap.get(m);
      const cg = cgMap.get(m);
      const cgPt = cg && cg.curve ? cg.curve.find((pt) => pt.budget === cgStep) : null;
      const cgQual = cgPt ? cgPt.qualify : (cg ? cg.qualify15k : null);
      const cgTot = cgPt ? cgPt.total : (cg ? cg.total : null);
      const cgShare = cgTot ? ((100 * cgQual) / cgTot).toFixed(1) + '%' : '–';
      const cells = [
        m,
        cl && cl.n ? `${fmt.n(cl.qualify)}/${fmt.n(cl.n)} (${cl.shareLabel})` : 'No listings match',
        nt ? `${fmt.n(nt.qualify15k)}/${fmt.n(nt.total)} (${nt.share15k.toFixed(1)}%)` : '–',
        cgTot ? `${fmt.n(cgQual)}/${fmt.n(cgTot)} (${cgShare})` : '–',
        cg && cg.medianPrice ? fmt.usd(cg.medianPrice) : '–',
      ];
      cells.forEach((val, idx) => {
        const td = document.createElement('td');
        if (idx === 0) td.className = 'left';
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    const wrap = document.createElement('div');
    wrap.className = 'tbl-scroll';
    wrap.appendChild(tbl);
    box.appendChild(wrap);
  }

  State.on(['models', 'year', 'mile', 'region', 'budget', 'focusModel', 'theme'], render);
  watch(host, (w) => { width = w; render(); });
})();
