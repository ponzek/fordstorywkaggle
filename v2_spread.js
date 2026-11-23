/*
 * v2_spread.js -- View 2: Asking-price spread (median + middle 50% IQR per model on shared USD axis).
 * Click or press Enter on any model row to focus that model across Views 4 and 6.
 */
(function () {
  'use strict';
  const { core, tokens, modelColor, shapePath, fmt, tip, watch, svg, clamp } = UI;
  const $ = (id) => document.getElementById(id);
  const host = $('v2-chart');
  let width = 0;

  function render() {
    if (!width) return;
    const T = tokens();
    const sState = State.s;
    const val = State.validation();
    const pool = State.poolIdx();
    const budget = sState.budget;

    const H = clamp(Math.round(width * 0.28), 220, 290);
    const m = { l: 145, r: 155, t: 18, b: 38 };
    const s = svg(host, width, H);
    s.attr('aria-label', 'Dot and IQR range plot of asking prices across compact SUV models');

    if (!val.ok || !sState.models.length || !pool.length) {
      s.append('text').attr('x', width / 2).attr('y', H / 2).attr('text-anchor', 'middle')
        .text(!val.ok ? val.error : 'No listings match');
      $('v2-sub').textContent = !val.ok ? val.error : 'No listings match';
      $('v2-table').textContent = '';
      return;
    }

    const rows = core.priceSpreadByModel(pool, sState.models, budget);
    const maxVal = Math.max(30000, budget * 1.1, d3.max(rows, (r) => r.q75 || 0) * 1.08);
    const xmax = Math.ceil(maxVal / 5000) * 5000;

    const x = d3.scaleLinear([0, xmax], [m.l, width - m.r]);
    const y = d3.scaleBand(rows.map((r) => r.model), [m.t, H - m.b]).padding(0.32);

    s.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(-(H - m.t - m.b)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => fmt.usdK(d)))
      .call((g) => g.selectAll('text').attr('dy', '1.2em'));
    s.append('text').attr('class', 'axis-title').attr('x', m.l + (width - m.l - m.r) / 2).attr('y', H - 4)
      .attr('text-anchor', 'middle').text('Asking price (USD · dot = median, bar = middle 50%)');

    // Budget cap reference line
    const bx = x(clamp(budget, 0, xmax));
    s.append('line')
      .attr('x1', bx).attr('x2', bx).attr('y1', m.t).attr('y2', H - m.b)
      .attr('stroke', T.budget).attr('stroke-width', 2).attr('stroke-dasharray', '5 4');
    s.append('text')
      .attr('x', clamp(bx + 6, m.l, width - m.r - 60)).attr('y', m.t + 10)
      .attr('fill', T.budget).style('font-weight', '650').text(fmt.usd(budget));

    rows.forEach((r) => {
      const cy = y(r.model) + y.bandwidth() / 2;
      const col = modelColor(r.model);
      const isFocus = r.model === sState.focusModel;

      const g = s.append('g').attr('class', 'mark-hit').attr('tabindex', '0').attr('role', 'button')
        .attr('aria-label', `${r.model}: ${r.n} listings, median ${fmt.usd(r.median)}, ${r.qualify} in budget`)
        .on('click', () => State.setFocusModel(r.model))
        .on('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); State.setFocusModel(r.model); } });

      if (isFocus) {
        g.append('rect')
          .attr('x', 4).attr('y', y(r.model) - 2).attr('width', width - 8).attr('height', y.bandwidth() + 4)
          .attr('rx', 6).attr('fill', col).attr('opacity', 0.08);
      }

      g.append('text').attr('class', isFocus ? 'ink' : 'ink2')
        .attr('x', m.l - 12).attr('y', cy + 4).attr('text-anchor', 'end')
        .style('font-weight', isFocus ? '700' : '500')
        .text(r.model);

      if (!r.n) {
        g.append('text').attr('class', 'ink2').attr('x', m.l + 8).attr('y', cy + 4).text('No listings match');
        return;
      }

      // Middle 50% (IQR) line
      g.append('line')
        .attr('x1', x(r.q25)).attr('x2', x(r.q75)).attr('y1', cy).attr('y2', cy)
        .attr('stroke', col).attr('stroke-width', 5).attr('stroke-linecap', 'round').attr('opacity', 0.72);

      // Median shape mark
      g.append('path')
        .attr('d', shapePath(UI.modelShape(r.model), 6.5))
        .attr('transform', `translate(${x(r.median)},${cy})`)
        .attr('fill', col).attr('stroke', T.surface).attr('stroke-width', 2);

      // Right-hand count + median readout
      g.append('text').attr('class', 'ink2')
        .attr('x', width - m.r + 10).attr('y', cy + 4)
        .text(`${fmt.usd(r.median)} · ${r.qualify}/${r.n} (${r.shareLabel})`);

      g.on('pointermove', (ev) => {
        tip.show(ev, r.model, [
          { color: col, label: 'Median price', value: fmt.usd(r.median) },
          { label: 'Middle 50% of prices (25th–75th pct)', value: `${fmt.usd(r.q25)} – ${fmt.usd(r.q75)}` },
          { label: `At or below ${fmt.usd(budget)}`, value: `${r.qualify} / ${r.n} (${r.shareLabel})` },
        ]);
      }).on('pointerleave', () => tip.hide());
    });

    $('v2-sub').textContent = `Focused: ${sState.focusModel} · Middle 50% and median across ${fmt.n(pool.length)} matching listings`;
    renderTable(rows);
  }

  function renderTable(rows) {
    const box = $('v2-table');
    box.textContent = '';
    const tbl = document.createElement('table');
    tbl.className = 'tbl';
    tbl.innerHTML = '<thead><tr><th class="left">Model</th><th>Listings</th><th>In budget</th><th>Share</th><th>25th pct</th><th>Median</th><th>75th pct</th></tr></thead>';
    const tb = document.createElement('tbody');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      [r.model, fmt.n(r.n), fmt.n(r.qualify), r.shareLabel, fmt.usd(r.q25), fmt.usd(r.median), fmt.usd(r.q75)].forEach((v, i) => {
        const td = document.createElement('td');
        if (i === 0) td.className = 'left';
        td.textContent = v;
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    box.appendChild(tbl);
  }

  State.on(['models', 'year', 'mile', 'region', 'budget', 'focusModel', 'theme'], render);
  watch(host, (w) => { width = w; render(); });
})();
