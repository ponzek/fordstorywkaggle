/*
 * v5_gaps.js -- View 5: Matched price gaps vs Ford Escape across comparable (year x 25k-mile band) strata.
 * Equal-weighted mean across qualifying strata (>= cutoff per side). Uses uncapped pool.
 * Supports sensitivity cutoffs (10, 15, 20), clicking a model to inspect strata, and clicking a stratum
 * to focus Views 4 and 9.
 */
(function () {
  'use strict';
  const { D, core, tokens, modelColor, shapePath, fmt, tip, watch, svg, clamp } = UI;
  const $ = (id) => document.getElementById(id);
  const host = $('v5-chart');
  const strataBox = $('v5-strata');
  let width = 0;
  let openModel = 'Chevrolet Equinox';

  document.querySelectorAll('.v5-cut').forEach((btn) => {
    btn.onclick = () => {
      const n = Number(btn.dataset.n);
      document.querySelectorAll('.v5-cut').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.n) === n ? 'true' : 'false'));
      State.set({ gapMinN: n });
    };
  });

  function render() {
    if (!width) return;
    const T = tokens();
    const sState = State.s;
    const val = State.validation();
    const pool = State.poolIdxAllModels();

    const H = clamp(Math.round(width * 0.25), 210, 260);
    const m = { l: 155, r: 165, t: 18, b: 38 };
    const s = svg(host, width, H);
    s.attr('aria-label', 'Dot plot of matched price gaps relative to Ford Escape in USD');

    if (!val.ok || !pool.length) {
      s.append('text').attr('x', width / 2).attr('y', H / 2).attr('text-anchor', 'middle')
        .text(!val.ok ? val.error : 'No listings match');
      strataBox.hidden = true;
      $('v5-sub').textContent = !val.ok ? val.error : 'No listings match';
      return;
    }

    const gaps = core.matchedPriceGaps(pool, sState.gapMinN);
    const validVals = gaps.map((g) => g.gap).filter((v) => v != null);
    const absMax = Math.max(4000, validVals.length ? Math.max(...validVals.map(Math.abs)) * 1.15 : 6000);
    const lim = Math.ceil(absMax / 1000) * 1000;

    const x = d3.scaleLinear([-lim, lim], [m.l, width - m.r]);
    const y = d3.scaleBand(gaps.map((g) => g.model), [m.t, H - m.b]).padding(0.32);

    s.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(-(H - m.t - m.b)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => fmt.usdK(d)))
      .call((g) => g.selectAll('text').attr('dy', '1.2em'));
    s.append('text').attr('class', 'axis-title').attr('x', m.l + (width - m.l - m.r) / 2).attr('y', H - 4)
      .attr('text-anchor', 'middle').text(`Equal-weighted matched gap vs. Ford Escape (USD · min ${sState.gapMinN}/side)`);

    // Zero line (Escape parity)
    s.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', H - m.b)
      .attr('stroke', T.ink).attr('stroke-width', 1.5);
    s.append('text').attr('x', x(0) + 4).attr('y', m.t + 10).attr('class', 'ink2').text('$0 = Escape parity');

    gaps.forEach((g) => {
      const cy = y(g.model) + y.bandwidth() / 2;
      const col = modelColor(g.model);
      const isOpen = g.model === openModel;

      const row = s.append('g').attr('class', 'mark-hit').attr('tabindex', '0').attr('role', 'button')
        .attr('aria-label', `${g.model}: ${g.strataCount} strata, gap ${g.gap == null ? 'insufficient overlap' : fmt.usdSigned(g.gap)}`)
        .on('click', () => { openModel = g.model; renderStrata(gaps); render(); })
        .on('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openModel = g.model; renderStrata(gaps); render(); } });

      if (isOpen) {
        row.append('rect').attr('x', 4).attr('y', y(g.model) - 2).attr('width', width - 8).attr('height', y.bandwidth() + 4)
          .attr('rx', 6).attr('fill', col).attr('opacity', 0.08);
      }

      row.append('text').attr('class', isOpen ? 'ink' : 'ink2')
        .attr('x', m.l - 12).attr('y', cy + 4).attr('text-anchor', 'end')
        .style('font-weight', isOpen ? '700' : '500')
        .text(`${g.model} (${g.strataCount})`);

      if (g.gap == null) {
        row.append('text').attr('class', 'ink2').attr('x', m.l + 8).attr('y', cy + 4)
          .text(`Insufficient overlap (0 strata ≥ ${sState.gapMinN}/side)`);
        return;
      }

      row.append('line').attr('x1', x(0)).attr('x2', x(g.gap)).attr('y1', cy).attr('y2', cy)
        .attr('stroke', col).attr('stroke-width', 3.5).attr('stroke-linecap', 'round');

      row.append('path')
        .attr('d', shapePath(UI.modelShape(g.model), 6.5))
        .attr('transform', `translate(${x(g.gap)},${cy})`)
        .attr('fill', col).attr('stroke', T.surface).attr('stroke-width', 2);

      row.append('text').attr('class', 'ink2')
        .attr('x', width - m.r + 10).attr('y', cy + 4)
        .text(`${fmt.usdSigned(Math.round(g.gap))} · ${g.strataCount} groups`);

      row.on('pointermove', (ev) => {
        tip.show(ev, `${g.model} vs. Ford Escape`, [
          { color: col, label: 'Matched gap', value: fmt.usdSigned(Math.round(g.gap)) },
          { label: 'Matching groups', value: `${g.strataCount} (≥${g.cutoff} per side)` },
          { label: 'Matched listings', value: `${g.altMatched} ${UI.shortModel(g.model)} vs ${g.escMatched} Escape` },
        ]);
      }).on('pointerleave', () => tip.hide());
    });

    $('v5-sub').textContent = `Uncapped filtered pool · ${D.levels.mileBand.length} mileage bands × 4 years · click a model to inspect matching groups`;
    renderStrata(gaps);
  }

  function renderStrata(gaps) {
    const g = gaps.find((x) => x.model === openModel) || gaps[0];
    if (!g) { strataBox.hidden = true; return; }
    strataBox.hidden = false;
    strataBox.textContent = '';

    const hdr = document.createElement('div');
    hdr.style.display = 'flex';
    hdr.style.justifyContent = 'space-between';
    hdr.style.alignItems = 'center';
    hdr.style.flexWrap = 'wrap';
    hdr.style.gap = '8px';

    const title = document.createElement('strong');
    title.textContent = `${g.model} vs. Ford Escape — matching year × 25k-mile groups (${g.strataCount} groups, ≥ ${g.cutoff} cars/side)`;
    hdr.appendChild(title);

    if (State.s.activeStratum) {
      const clr = document.createElement('button');
      clr.className = 'btn';
      clr.textContent = `Clear group filter (${State.s.activeStratum.year}, ${State.s.activeStratum.bandLabel})`;
      clr.onclick = () => State.set({ activeStratum: null });
      hdr.appendChild(clr);
    }
    strataBox.appendChild(hdr);

    if (!g.strata.length) {
      const p = document.createElement('p');
      p.style.margin = '6px 0 0';
      p.textContent = `Insufficient overlap: no year-and-mileage group has at least ${g.cutoff} listings on both sides.`;
      strataBox.appendChild(p);
      return;
    }

    const tbl = document.createElement('table');
    tbl.className = 'tbl';
    tbl.innerHTML = '<thead><tr><th class="left">Year</th><th class="left">Mileage band</th><th>Escape n</th><th>Escape median</th><th>Alt n</th><th>Alt median</th><th>Price gap</th></tr></thead>';
    const tb = document.createElement('tbody');
    g.strata.forEach((st) => {
      const tr = document.createElement('tr');
      const isSel = State.s.activeStratum && State.s.activeStratum.year === st.year && State.s.activeStratum.band === st.band;
      tr.className = 'clickable' + (isSel ? ' row-selected' : '');
      [st.year, st.bandLabel, st.escN, fmt.usd(st.escMedian), st.altN, fmt.usd(st.altMedian), fmt.usdSigned(Math.round(st.gap))].forEach((v, i) => {
        const td = document.createElement('td');
        if (i <= 1) td.className = 'left';
        td.textContent = String(v);
        tr.appendChild(td);
      });
      tr.onclick = () => {
        const next = isSel ? null : { model: g.model, year: st.year, band: st.band, bandLabel: st.bandLabel };
        State.set({ activeStratum: next });
      };
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    const sc = document.createElement('div');
    sc.className = 'tbl-scroll';
    sc.appendChild(tbl);
    strataBox.appendChild(sc);
  }

  State.on(['models', 'year', 'mile', 'region', 'gapMinN', 'activeStratum', 'theme'], render);
  watch(host, (w) => { width = w; render(); });
})();
