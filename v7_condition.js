/*
 * v7_condition.js -- View 7: Seller-reported condition mix among in-budget listings (including Unknown).
 * Clicking any bar highlights/filters matching listings in View 9 and View 4.
 */
(function () {
  'use strict';
  const { core, tokens, modelColor, fmt, tip, watch, svg, clamp } = UI;
  const $ = (id) => document.getElementById(id);
  const host = $('v7-chart');
  let width = 0;
  let scope = 'focus'; // 'focus' | 'all'

  $('v7-scope-focus').onclick = () => {
    scope = 'focus';
    $('v7-scope-focus').setAttribute('aria-pressed', 'true');
    $('v7-scope-all').setAttribute('aria-pressed', 'false');
    render();
  };
  $('v7-scope-all').onclick = () => {
    scope = 'all';
    $('v7-scope-focus').setAttribute('aria-pressed', 'false');
    $('v7-scope-all').setAttribute('aria-pressed', 'true');
    render();
  };

  function render() {
    if (!width) return;
    const T = tokens();
    const sState = State.s;
    const val = State.validation();
    const elig = State.eligibleIdx();

    const H = clamp(Math.round(width * 0.27), 230, 280);
    const m = { l: 96, r: 120, t: 14, b: 38 };
    const s = svg(host, width, H);
    s.attr('aria-label', 'Bar chart of listed condition mix among in-budget listings');

    if (!val.ok || !sState.models.length || !elig.length) {
      s.append('text').attr('x', width / 2).attr('y', H / 2).attr('text-anchor', 'middle')
        .text(!val.ok ? val.error : 'No in-budget listings match');
      $('v7-sub').textContent = !val.ok ? val.error : 'No in-budget listings match';
      return;
    }

    const focus = scope === 'focus' ? sState.focusModel : null;
    const mix = core.conditionMix(elig, focus);

    if (!mix.total) {
      s.append('text').attr('x', width / 2).attr('y', H / 2).attr('text-anchor', 'middle')
        .text(`No ${focus || 'selected'} listings fit ${fmt.usd(sState.budget)}`);
      $('v7-sub').textContent = `0 in-budget listings for ${focus || 'selection'}`;
      return;
    }

    const maxPct = Math.max(50, Math.ceil((d3.max(mix.bars, (b) => b.pct || 0) || 50) / 10) * 10);
    const x = d3.scaleLinear([0, maxPct], [m.l, width - m.r]);
    const y = d3.scaleBand(mix.bars.map((b) => b.condition), [m.t, H - m.b]).padding(0.24);
    const col = focus ? modelColor(focus) : T.s[0];

    s.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(-(H - m.t - m.b)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d) => d + '%'))
      .call((g) => g.selectAll('text').attr('dy', '1.2em'));
    s.append('text').attr('class', 'axis-title').attr('x', m.l + (width - m.l - m.r) / 2).attr('y', H - 4)
      .attr('text-anchor', 'middle').text(`Share of in-budget listings (%) · n=${fmt.n(mix.total)}`);

    mix.bars.forEach((b) => {
      const ry = y(b.condition);
      const bh = y.bandwidth();
      const isSel = sState.condition === b.condition;
      const isUnk = b.condition === 'Unknown';

      const g = s.append('g').attr('class', 'mark-hit').attr('tabindex', '0').attr('role', 'button')
        .attr('aria-label', `${b.condition}: ${b.count} listings (${b.pct.toFixed(1)}%)`)
        .on('click', () => State.set({ condition: isSel ? null : b.condition }))
        .on('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); State.set({ condition: isSel ? null : b.condition }); }
        });

      if (isSel) {
        g.append('rect').attr('x', 4).attr('y', ry - 2).attr('width', width - 8).attr('height', bh + 4)
          .attr('rx', 5).attr('fill', col).attr('opacity', 0.10);
      }

      g.append('text').attr('class', isSel ? 'ink' : 'ink2')
        .attr('x', m.l - 10).attr('y', ry + bh / 2 + 4).attr('text-anchor', 'end')
        .style('font-weight', isSel ? '700' : '500')
        .text(b.condition);

      g.append('rect')
        .attr('x', x(0)).attr('y', ry)
        .attr('width', Math.max(0, x(b.pct) - x(0))).attr('height', bh)
        .attr('rx', 4)
        .attr('fill', isUnk ? T.ink3 : col)
        .attr('opacity', !sState.condition || isSel ? 0.88 : 0.30);

      g.append('text').attr('class', 'ink2')
        .attr('x', width - m.r + 10).attr('y', ry + bh / 2 + 4)
        .text(`${fmt.n(b.count)} (${b.pct.toFixed(1)}%)`);

      g.on('pointermove', (ev) => {
        tip.show(ev, `${b.condition} condition`, [
          { color: isUnk ? T.ink3 : col, label: 'Count in budget', value: `${fmt.n(b.count)} of ${fmt.n(mix.total)}` },
          { label: 'Share', value: b.pct.toFixed(1) + '%' },
          { label: 'Click action', value: isSel ? 'Clear condition highlight' : `Filter View 9 to ${b.condition}` },
        ]);
      }).on('pointerleave', () => tip.hide());
    });

    const scopeLabel = focus || 'All selected models';
    $('v7-sub').textContent = sState.condition
      ? `${scopeLabel} · Filtered to condition "${sState.condition}" (click bar to clear)`
      : `${scopeLabel} · n=${fmt.n(mix.total)} in budget (click a bar to filter View 9)`;
  }

  State.on(['models', 'focusModel', 'year', 'mile', 'region', 'budget', 'condition', 'theme'], render);
  watch(host, (w) => { width = w; render(); });
})();
