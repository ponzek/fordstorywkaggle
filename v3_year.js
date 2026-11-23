/*
 * v3_year.js -- View 3: Median asking price by model year (2016-2019).
 * Distinct colors & shapes per model, dashed horizontal budget cap, gaps for empty years,
 * and click-a-year to filter or restore the 2016-2019 range.
 */
(function () {
  'use strict';
  const { core, tokens, modelColor, shapePath, shapeIconSvg, shortModel, fmt, tip, watch, svg, clamp } = UI;
  const $ = (id) => document.getElementById(id);
  const host = $('v3-chart');
  let width = 0;

  const YEARS = [2016, 2017, 2018, 2019];

  function render() {
    if (!width) return;
    const T = tokens();
    const sState = State.s;
    const val = State.validation();
    const pool = State.poolIdx();
    const budget = sState.budget;

    const H = clamp(Math.round(width * 0.34), 260, 340);
    const m = { l: 56, r: 94, t: 18, b: 40 };
    const s = svg(host, width, H);
    s.attr('aria-label', 'Line chart of median asking price by model year (2016 to 2019)');

    if (!val.ok || !sState.models.length || !pool.length) {
      s.append('text').attr('x', width / 2).attr('y', H / 2).attr('text-anchor', 'middle')
        .text(!val.ok ? val.error : 'No listings match');
      $('v3-legend').textContent = '';
      $('v3-sub').textContent = !val.ok ? val.error : 'No listings match';
      return;
    }

    const series = core.medianByModelYear(pool, sState.models, YEARS);
    const maxMed = d3.max(series, (sr) => d3.max(sr.points, (p) => p.median || 0)) || 25000;
    const ymax = Math.ceil(Math.max(maxMed * 1.12, budget * 1.12, 25000) / 5000) * 5000;

    const x = d3.scalePoint(YEARS, [m.l + 18, width - m.r - 18]);
    const y = d3.scaleLinear([5000, ymax], [H - m.b, m.t]);

    s.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(-(width - m.l - m.r)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickFormat((d) => String(d)))
      .call((g) => g.selectAll('text').attr('dy', '1.2em'));
    s.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(8).tickFormat((d) => fmt.usdK(d)))
      .call((g) => g.select('.domain').remove());

    s.append('text').attr('class', 'axis-title').attr('x', m.l + (width - m.l - m.r) / 2).attr('y', H - 6)
      .attr('text-anchor', 'middle').text('Model year (separate cars per year in April–May 2021 snapshot)');
    s.append('text').attr('class', 'axis-title').attr('transform', `translate(14,${(m.t + H - m.b) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle').text('Median asking price (USD)');

    // Budget cap horizontal dashed marker
    const by = y(clamp(budget, 5000, ymax));
    s.append('line')
      .attr('x1', m.l).attr('x2', width - m.r).attr('y1', by).attr('y2', by)
      .attr('stroke', T.budget).attr('stroke-width', 2).attr('stroke-dasharray', '5 4');
    s.append('text')
      .attr('x', m.l + 6).attr('y', Math.max(m.t + 12, by - 6))
      .attr('fill', T.budget).style('font-weight', '650')
      .text(`Budget cap ${fmt.usd(budget)}`);

    const line = d3.line().defined((d) => d.median != null).x((d) => x(d.year)).y((d) => y(d.median));
    const ends = [];

    series.forEach((sr) => {
      const col = modelColor(sr.model);
      const isFocus = sr.model === sState.focusModel;
      s.append('path')
        .attr('d', line(sr.points))
        .attr('fill', 'none')
        .attr('stroke', col)
        .attr('stroke-width', isFocus ? 2.6 : 1.7)
        .attr('stroke-opacity', isFocus ? 1 : 0.84);

      sr.points.forEach((pt) => {
        if (pt.median == null) return;
        const px = x(pt.year), py = y(pt.median);
        const hit = s.append('path')
          .attr('class', 'mark-hit')
          .attr('tabindex', '0')
          .attr('role', 'button')
          .attr('aria-label', `${sr.model} ${pt.year}: median ${fmt.usd(pt.median)}, n=${pt.n}`)
          .attr('d', shapePath(UI.modelShape(sr.model), isFocus ? 5.5 : 4.5))
          .attr('transform', `translate(${px},${py})`)
          .attr('fill', col).attr('stroke', T.surface).attr('stroke-width', 1.6);

        const toggleYr = () => {
          const isolated = sState.yearMin === pt.year && sState.yearMax === pt.year;
          State.set(isolated ? { yearMin: 2016, yearMax: 2019 } : { yearMin: pt.year, yearMax: pt.year });
        };
        hit.on('click', toggleYr)
          .on('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleYr(); } })
          .on('pointermove', (ev) => {
            tip.show(ev, `${sr.model} · ${pt.year} (click to isolate year)`, [
              { color: col, label: 'Median price', value: fmt.usd(pt.median) },
              { label: 'Middle 50%', value: `${fmt.usd(pt.q25)} – ${fmt.usd(pt.q75)}` },
              { label: 'Listings (n)', value: fmt.n(pt.n) },
            ]);
          })
          .on('pointerleave', () => tip.hide());
      });

      const last = [...sr.points].reverse().find((p) => p.median != null);
      if (last) ends.push({ model: sr.model, y: y(last.median), label: shortModel(sr.model) });
    });

    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) {
      ends[i].ly = Math.max(ends[i].y, (ends[i - 1].ly ?? ends[i - 1].y) + 14);
    }
    ends.forEach((e) => {
      s.append('text').attr('class', 'ink2').attr('x', width - m.r + 8).attr('y', (e.ly ?? e.y) + 4)
        .style('font-weight', e.model === sState.focusModel ? '650' : '400').text(e.label);
    });

    const lg = $('v3-legend');
    lg.textContent = '';
    series.forEach((sr) => {
      const sp = document.createElement('span');
      sp.appendChild(shapeIconSvg(sr.model));
      sp.append(sr.model);
      lg.appendChild(sp);
    });

    $('v3-sub').textContent = sState.yearMin === sState.yearMax
      ? `Isolated model year: ${sState.yearMin} (click any point again to show 2016–2019)`
      : `Showing model years ${sState.yearMin}–${sState.yearMax}`;
  }

  State.on(['models', 'year', 'mile', 'region', 'budget', 'focusModel', 'theme'], render);
  watch(host, (w) => { width = w; render(); });
})();
