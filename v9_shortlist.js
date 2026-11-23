/*
 * v9_shortlist.js -- View 9: Historical listing shortlist table.
 * Sortable by any column, shows public row keys (no raw listing IDs/VINs), respects active
 * condition & View 5 stratum filters, and links clicks/Enter back to Views 4 and 8.
 */
(function () {
  'use strict';
  const { core, fmt, shapeIconSvg } = UI;
  const $ = (id) => document.getElementById(id);
  const host = $('v9-table');

  let includeOver = false;
  let sortCol = 'price';
  let sortAsc = true;

  $('v9-only-in').onclick = () => {
    includeOver = false;
    $('v9-only-in').setAttribute('aria-pressed', 'true');
    $('v9-include-over').setAttribute('aria-pressed', 'false');
    render();
  };
  $('v9-include-over').onclick = () => {
    includeOver = true;
    $('v9-only-in').setAttribute('aria-pressed', 'false');
    $('v9-include-over').setAttribute('aria-pressed', 'true');
    render();
  };
  const clearSubBtn = $('v9-clear-subfilters');
  clearSubBtn.onclick = () => State.set({ condition: null, activeStratum: null });

  function render() {
    const sState = State.s;
    clearSubBtn.hidden = !(sState.condition || sState.activeStratum);
    const val = State.validation();
    const pool = State.poolIdx();
    host.textContent = '';

    if (!val.ok || !sState.models.length || !pool.length) {
      host.innerHTML = `<div class="empty">${!val.ok ? val.error : 'No listings match these filters.'}</div>`;
      $('v9-status').textContent = '0 rows';
      return;
    }

    let rows = [];
    for (let j = 0; j < pool.length; j++) {
      const r = core.rowAt(pool[j]);
      if (!includeOver && r.price > sState.budget && r.key !== sState.selectedRowKey) continue;
      if (sState.condition && r.condition !== sState.condition) continue;
      if (sState.activeStratum && (r.year !== sState.activeStratum.year || core.mileBandIndex(r.miles) !== sState.activeStratum.band)) continue;
      rows.push(r);
    }

    if (!rows.length) {
      host.innerHTML = `<div class="empty">No listings fit ${fmt.usd(sState.budget)} with the current filters. Raise the budget cap or toggle "All filtered".</div>`;
      $('v9-status').textContent = `0 rows within ${fmt.usd(sState.budget)}`;
      return;
    }

    rows.sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });

    const maxShown = 150;
    const shown = rows.slice(0, maxShown);
    // Always keep selectedRowKey visible if outside top 150
    if (sState.selectedRowKey && !shown.some((r) => r.key === sState.selectedRowKey)) {
      const hit = rows.find((r) => r.key === sState.selectedRowKey);
      if (hit) shown.unshift(hit);
    }

    const tbl = document.createElement('table');
    tbl.className = 'tbl';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const cols = [
      ['key', 'Row ID', true],
      ['model', 'SUV Model', true],
      ['year', 'Year', false],
      ['miles', 'Odometer', false],
      ['price', 'Price (USD)', false],
      ['state', 'State', true],
      ['region', 'Region', true],
      ['date', 'Posted', true],
      ['condition', 'Condition', true],
      ['status', 'Budget status', true],
    ];
    cols.forEach(([key, label, isLeft]) => {
      const th = document.createElement('th');
      if (isLeft) th.className = 'left';
      if (key === 'status') {
        th.textContent = label;
      } else {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label + (sortCol === key ? (sortAsc ? ' ▲' : ' ▼') : '');
        b.onclick = () => {
          if (sortCol === key) sortAsc = !sortAsc;
          else { sortCol = key; sortAsc = true; }
          render();
        };
        th.appendChild(b);
      }
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    tbl.appendChild(thead);

    const tb = document.createElement('tbody');
    shown.forEach((r) => {
      const tr = document.createElement('tr');
      const isSel = sState.selectedRowKey === r.key;
      const isIn = r.price <= sState.budget;
      tr.className = 'clickable' + (isSel ? ' row-selected' : '');
      tr.tabIndex = 0;

      const pick = () => State.selectRow(r.key, { focusModel: true });
      tr.onclick = pick;
      tr.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } };

      const addCell = (txt, isLeft) => {
        const td = document.createElement('td');
        if (isLeft) td.className = 'left';
        td.textContent = txt;
        tr.appendChild(td);
        return td;
      };

      addCell(r.key, true);
      const tdModel = document.createElement('td');
      tdModel.className = 'left';
      const wrap = document.createElement('span');
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';
      wrap.appendChild(shapeIconSvg(r.model));
      wrap.append(r.model);
      tdModel.appendChild(wrap);
      tr.appendChild(tdModel);

      addCell(String(r.year), false);
      addCell(fmt.mi(r.miles), false);
      addCell(fmt.usd(r.price), false);
      addCell(r.state, true);
      addCell(r.region, true);
      addCell(r.date, true);
      addCell(r.condition, true);

      const tdStatus = document.createElement('td');
      tdStatus.className = 'left';
      const badge = document.createElement('span');
      badge.className = isIn ? 'badge-in' : 'badge-over';
      badge.textContent = isIn ? 'In budget' : 'Over budget';
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);

      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    host.appendChild(tbl);

    const activeExtras = [];
    if (sState.condition) activeExtras.push(`condition=${sState.condition}`);
    if (sState.activeStratum) activeExtras.push(`stratum=${sState.activeStratum.year} (${sState.activeStratum.bandLabel})`);
    const extraTxt = activeExtras.length ? ` · filtered by ${activeExtras.join(', ')}` : '';
    $('v9-status').textContent = `Showing ${fmt.n(shown.length)} of ${fmt.n(rows.length)} rows${extraTxt}`;
  }

  State.on(['models', 'focusModel', 'year', 'mile', 'region', 'budget', 'condition', 'activeStratum', 'selectedRowKey', 'theme'], render);
  render();
})();
