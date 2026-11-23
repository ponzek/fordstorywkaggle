/*
 * v6_regions.js -- View 6: Regional availability across the 4 U.S. Census regions.
 * Bars 0-100% show in-budget share for the focused SUV with qualifying/total counts.
 * Clicking a region filters the main story; clicking All U.S. (or the active region again) clears the filter.
 */
(function () {
  'use strict';
  const { core, tokens, modelColor, fmt, tip, watch, svg, clamp } = UI;
  const $ = (id) => document.getElementById(id);
  const host = $('v6-chart');
  let width = 0;

  function render() {
    if (!width) return;
    const T = tokens();
    const sState = State.s;
    const val = State.validation();
    const poolNoReg = State.poolIdxNoRegion();

    const H = clamp(Math.round(width * 0.25), 220, 270);
    const m = { l: 105, r: 130, t: 16, b: 38 };
    const s = svg(host, width, H);
    s.attr('aria-label', 'Regional budget share bars across Northeast, Midwest, South, and West');

    if (!val.ok || !sState.models.length || !poolNoReg.length) {
      s.append('text').attr('x', width / 2).attr('y', H / 2).attr('text-anchor', 'middle')
        .text(!val.ok ? val.error : 'No listings match');
      $('v6-sub').textContent = !val.ok ? val.error : 'No listings match';
      return;
    }

    const focus = sState.models.includes(sState.focusModel) ? sState.focusModel : sState.models[0];
    const avail = core.regionalAvailability(poolNoReg, focus, sState.budget);
    const rows = [...avail.regions, avail.combined];
    const col = modelColor(focus);

    const x = d3.scaleLinear([0, 100], [m.l, width - m.r]);
    const y = d3.scaleBand(rows.map((r) => r.region), [m.t, H - m.b]).padding(0.28);

    s.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(-(H - m.t - m.b)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d) => d + '%'))
      .call((g) => g.selectAll('text').attr('dy', '1.2em'));
    s.append('text').attr('class', 'axis-title').attr('x', m.l + (width - m.l - m.r) / 2).attr('y', H - 4)
      .attr('text-anchor', 'middle').text(`Regional share within ${fmt.usd(sState.budget)} (%)`);

    rows.forEach((r) => {
      const isCombined = r.region === 'All U.S.';
      const isSelected = (!isCombined && sState.region === r.region) || (isCombined && !sState.region);
      const ry = y(r.region);
      const bh = y.bandwidth();

      const g = s.append('g').attr('class', 'mark-hit').attr('tabindex', '0').attr('role', 'button')
        .attr('aria-label', `${r.region}: ${r.qualify} of ${r.total} (${r.label})`)
        .on('click', () => {
          if (isCombined) State.set({ region: null });
          else State.set({ region: sState.region === r.region ? null : r.region });
        })
        .on('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            if (isCombined) State.set({ region: null });
            else State.set({ region: sState.region === r.region ? null : r.region });
          }
        });

      if (isSelected && !isCombined) {
        g.append('rect').attr('x', 4).attr('y', ry - 2).attr('width', width - 8).attr('height', bh + 4)
          .attr('rx', 6).attr('fill', col).attr('opacity', 0.10);
      }

      if (isCombined) {
        s.append('line').attr('x1', m.l).attr('x2', width - m.r).attr('y1', ry - 4).attr('y2', ry - 4)
          .attr('stroke', T.grid).attr('stroke-dasharray', '3 3');
      }

      g.append('text').attr('class', isSelected ? 'ink' : 'ink2')
        .attr('x', m.l - 10).attr('y', ry + bh / 2 + 4).attr('text-anchor', 'end')
        .style('font-weight', isSelected || isCombined ? '700' : '500')
        .text(r.region);

      if (r.total > 0) {
        g.append('rect')
          .attr('x', x(0)).attr('y', ry)
          .attr('width', Math.max(0, x(r.pct) - x(0))).attr('height', bh)
          .attr('rx', 4)
          .attr('fill', isCombined ? T.ink2 : col)
          .attr('opacity', !sState.region || isSelected || isCombined ? 0.9 : 0.35);

        g.append('text').attr('class', 'ink2')
          .attr('x', width - m.r + 10).attr('y', ry + bh / 2 + 4)
          .text(`${fmt.n(r.qualify)}/${fmt.n(r.total)} (${r.label})`);
      } else {
        g.append('text').attr('class', 'ink2').attr('x', m.l + 8).attr('y', ry + bh / 2 + 4).text('No listings match');
      }

      g.on('pointermove', (ev) => {
        tip.show(ev, `${focus} · ${r.region}`, [
          { color: isCombined ? T.ink2 : col, label: 'Within budget', value: `${fmt.n(r.qualify)} / ${fmt.n(r.total)}` },
          { label: 'Share', value: r.label },
          { label: 'Click action', value: isCombined ? 'Show all 4 U.S. regions' : (sState.region === r.region ? 'Clear region filter' : `Filter story to ${r.region}`) },
        ]);
      }).on('pointerleave', () => tip.hide());
    });

    $('v6-sub').textContent = `${focus} · ${sState.region ? `Filtered to ${sState.region} (click bar again for All U.S.)` : 'All 4 U.S. Census regions (click a bar to filter)'}`;
  }

  State.on(['models', 'focusModel', 'year', 'mile', 'region', 'budget', 'theme'], render);
  watch(host, (w) => { width = w; render(); });
})();
