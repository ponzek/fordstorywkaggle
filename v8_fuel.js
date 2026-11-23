/*
 * v8_fuel.js -- View 8: Hypothetical annual fuel-cost scenario (miles/yr ÷ MPG × $/gal).
 * Anchored at $0. Compares 20, 25, 30 MPG benchmarks plus the selected listing's EPA MPG (or custom MPG).
 */
(function () {
  'use strict';
  const { core, tokens, fmt, tip, watch, svg, clamp } = UI;
  const $ = (id) => document.getElementById(id);
  const host = $('v8-chart');
  let width = 0;

  const milesIn = $('v8-miles');
  const priceIn = $('v8-price');
  const mpgIn = $('v8-mpg');
  const milesNum = $('v8-miles-num');
  const priceNum = $('v8-price-num');
  const mpgNum = $('v8-mpg-num');
  const warnEl = $('v8-warn');

  function updateFuel(patch) {
    State.set({ fuel: Object.assign({}, State.s.fuel, patch) });
  }

  milesIn.oninput = () => updateFuel({ miles: Number(milesIn.value) });
  priceIn.oninput = () => updateFuel({ price: Number(priceIn.value) });
  mpgIn.oninput = () => updateFuel({ customMpg: Number(mpgIn.value), carLabel: null });

  milesNum.onchange = () => updateFuel({ miles: milesNum.value === '' ? NaN : Number(milesNum.value) });
  priceNum.onchange = () => updateFuel({ price: priceNum.value === '' ? NaN : Number(priceNum.value) });
  mpgNum.onchange = () => updateFuel({ customMpg: mpgNum.value === '' ? NaN : Number(mpgNum.value), carLabel: null });

  $('v8-reset-defaults').onclick = () => updateFuel({ miles: 12000, price: 3.50, customMpg: 25, carLabel: null });

  function render() {
    const f = State.s.fuel;
    milesIn.value = isFinite(f.miles) ? clamp(f.miles, 0, 30000) : 12000;
    priceIn.value = isFinite(f.price) ? clamp(f.price, 0, 10) : 3.50;
    mpgIn.value = isFinite(f.customMpg) ? clamp(f.customMpg, 5, 100) : 25;
    if (document.activeElement !== milesNum) milesNum.value = isFinite(f.miles) ? f.miles : '';
    if (document.activeElement !== priceNum) priceNum.value = isFinite(f.price) ? f.price.toFixed(2) : '';
    if (document.activeElement !== mpgNum) mpgNum.value = isFinite(f.customMpg) ? f.customMpg.toFixed(1) : '';

    $('v8-car-banner').textContent = f.carLabel
      ? `Selected row: ${f.carLabel} · EPA compact SUV ref ${f.customMpg.toFixed(1)} MPG`
      : 'No listing row selected yet — select a row in View 9 to load its model EPA reference MPG.';

    const validCustom = core.fuelCost(f.miles, f.customMpg, f.price);
    if (!validCustom.ok) {
      warnEl.hidden = false;
      warnEl.textContent = validCustom.error;
      $('v8-note').textContent = validCustom.error;
      if (width) {
        const s = svg(host, width, 210);
        s.append('text').attr('x', width / 2).attr('y', 105).attr('text-anchor', 'middle').text(validCustom.error);
      }
      return;
    }
    warnEl.hidden = true;
    warnEl.textContent = '';

    if (!width) return;
    const T = tokens();
    const H = clamp(Math.round(width * 0.30), 210, 260);
    const m = { l: 168, r: 90, t: 16, b: 38 };
    const s = svg(host, width, H);
    s.attr('aria-label', 'Bar chart of estimated annual fuel cost by MPG scenario');

    const scenarios = [
      { label: '20 MPG (assumed)', mpg: 20, highlight: false },
      { label: '25 MPG (assumed)', mpg: 25, highlight: false },
      { label: '30 MPG (assumed)', mpg: 30, highlight: false },
      { label: f.carLabel ? `Selected (${f.customMpg.toFixed(1)} MPG)` : `Custom (${f.customMpg.toFixed(1)} MPG)`, mpg: f.customMpg, highlight: true },
    ].map((sc) => {
      const res = core.fuelCost(f.miles, sc.mpg, f.price);
      return Object.assign(sc, { dollars: res.ok ? res.annualDollars : 0 });
    });

    const maxDollars = Math.max(2500, Math.ceil((d3.max(scenarios, (d) => d.dollars) || 2500) * 1.15 / 500) * 500);
    const x = d3.scaleLinear([0, maxDollars], [m.l, width - m.r]);
    const y = d3.scaleBand(scenarios.map((d) => d.label), [m.t, H - m.b]).padding(0.28);

    s.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(-(H - m.t - m.b)).tickFormat(''));
    s.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d) => fmt.usdK(d)))
      .call((g) => g.selectAll('text').attr('dy', '1.2em'));
    s.append('text').attr('class', 'axis-title').attr('x', m.l + (width - m.l - m.r) / 2).attr('y', H - 4)
      .attr('text-anchor', 'middle').text(`Estimated annual fuel cost ($/year at ${fmt.n(f.miles)} mi/yr, $${f.price.toFixed(2)}/gal)`);

    scenarios.forEach((sc) => {
      const ry = y(sc.label);
      const bh = y.bandwidth();
      const col = sc.highlight ? T.s[2] : T.s[0];

      s.append('text').attr('class', sc.highlight ? 'ink' : 'ink2')
        .attr('x', m.l - 10).attr('y', ry + bh / 2 + 4).attr('text-anchor', 'end')
        .style('font-weight', sc.highlight ? '700' : '500')
        .text(sc.label);

      s.append('rect')
        .attr('x', x(0)).attr('y', ry)
        .attr('width', Math.max(0, x(sc.dollars) - x(0))).attr('height', bh)
        .attr('rx', 4).attr('fill', col).attr('opacity', sc.highlight ? 0.95 : 0.78)
        .on('pointermove', (ev) => {
          tip.show(ev, sc.label, [
            { color: col, label: 'Annual fuel cost', value: fmt.usd(Math.round(sc.dollars)) + ' / yr' },
            { label: 'Formula', value: `(${fmt.n(f.miles)} ÷ ${sc.mpg.toFixed(1)}) × $${f.price.toFixed(2)}` },
            { label: 'Monthly equivalent', value: fmt.usd(Math.round(sc.dollars / 12)) + ' / mo' },
          ]);
        })
        .on('pointerleave', () => tip.hide());

      s.append('text').attr('class', 'ink')
        .attr('x', x(sc.dollars) + 8).attr('y', ry + bh / 2 + 4)
        .style('font-weight', '600')
        .text(fmt.usd(Math.round(sc.dollars)));
    });

    $('v8-note').textContent = `Fuel-only estimate: (${fmt.n(f.miles)} mi/yr ÷ ${f.customMpg.toFixed(1)} MPG) × $${f.price.toFixed(2)}/gal = ${fmt.usd(Math.round((f.miles / f.customMpg) * f.price))}/yr. Excludes insurance, maintenance, and financing.`;
  }

  State.on(['fuel', 'selectedRowKey', 'theme'], render);
  watch(host, (w) => { width = w; render(); });
})();
