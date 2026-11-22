// Token Radar dashboard. Reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the board, filters, sorting, and a detail view for
// every protocol. No network: every byte shown comes from that data file.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;

  var state = { q: '', category: 'all', chain: 'all', risk: 'all', wl: false, tab: 'pre-token', sort: 'rank', dir: 1, selected: null };
  var rowsEl = document.getElementById('rows');
  var emptyEl = document.getElementById('empty');
  var countEl = document.getElementById('count');
  var dialog = document.getElementById('detail');

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('risk')) state.risk = params.get('risk');
    if (params.get('wl') === '1') state.wl = true;
    if (params.get('tab') === 'live') state.tab = 'live';
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.risk !== 'all') p.set('risk', state.risk);
    if (state.wl) p.set('wl', '1');
    if (state.tab === 'live') p.set('tab', 'live');
    if (state.selected) p.set('p', state.selected);
    if (state.sort !== 'rank') p.set('sort', state.sort);
    var next = p.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function isWatch(r) { return !!r.on_watchlist; }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.risk !== 'all' && r.risk !== state.risk) return false;
      if (state.wl && !isWatch(r)) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'prob') { av = a.launch_probability; bv = b.launch_probability; }
      else if (key === 'confidence') { av = a.confidence; bv = b.confidence; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function riskPill(risk) {
    var cls = risk === 'Low' ? 'low' : risk === 'High' ? 'high' : 'med';
    return el('span', { class: 'pill ' + cls, text: risk });
  }

  function boardRows(list) {
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    rowsEl.textContent = '';
    list.forEach(function (r) {
      var growthCls = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'chain unknown') + (isWatch(r) ? ' · watchlist' : '') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthCls, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: Math.round(r.launch_probability * 100) + '%' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', { class: 'num', text: r.confidence + '%' }),
        el('td', null, riskPill(r.risk))
      );
      rowsEl.appendChild(tr);
    });
  }

  function liveRows() {
    rowsEl.textContent = '';
    DATA.live.forEach(function (r) {
      rowsEl.appendChild(el('tr', { tabindex: '0' },
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'chain unknown') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: '—' }),
        el('td', { class: 'num', text: '—' }),
        el('td', null, el('span', { class: 'num', text: fmtUsd(r.mcap_usd) })),
        el('td', { class: 'num', text: '—' }),
        el('td', null, el('span', { class: 'pill pre', text: 'already trades' }))
      ));
    });
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = (row.farm_steps || []).map(function (s) {
      var at = s.indexOf(' Cost: ');
      return el('li', null, el('b', { text: at >= 0 ? s.slice(0, at) : s }), el('span', { class: 'cost', text: at >= 0 ? s.slice(at + 1) : '' }));
    });
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatch(row) ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'chain unknown') + ' · listed ' + (row.listed_at || 'date unknown') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('div', { class: 'detail-sec' },
      el('h3', { text: 'Model breakdown — launch-odds-2' }),
      el('div', { class: 'grid' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: '7-day growth' }), el('b', { text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Sector (' + row.sector + ')' }), el('b', { text: '×' + row.sector_multiple })),
        el('div', null, el('span', { text: 'Growth adjustment' }), el('b', { text: '×' + row.growth_adjustment })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { text: '×' + row.breadth_multiplier })),
        el('div', null, el('span', { text: 'Launch probability' }), el('b', { text: Math.round(row.launch_probability * 100) + '%' })),
        el('div', null, el('span', { text: 'Potential if launched' }), el('b', { text: fmtUsd(row.potential_usd) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Risk' }), el('b', { text: row.risk }))
      ),
      el('p', { class: 'sub note', text: 'Confidence ' + row.confidence + '% — from how complete this protocol’s snapshot record is. Implied value = launch probability × potential. This protocol records no token; the snapshot is not proof it has none.' }),
      el('div', { class: 'meter', 'aria-hidden': 'true' }, el('i', { style: 'width:' + row.confidence + '%' }))
    ));
    dialog.appendChild(el('div', { class: 'detail-sec' },
      el('h3', { text: 'Farm plan — 6 steps' }),
      el('ol', { class: 'steps' }, steps)
    ));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function fillSelect(id, values) {
    var sel = document.getElementById(id);
    values.forEach(function (v) { sel.appendChild(el('option', { value: v, text: v })); });
    sel.value = state[id] || 'all';
  }

  function renderFacts() {
    var top = DATA.rows[0];
    var facts = document.getElementById('facts');
    facts.textContent = '';
    [
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
      ['Pre-token rows', String(DATA.board_size)],
      ['Early rows below floor', String(DATA.early_size)],
      ['Top implied value', top ? fmtUsd(top.implied_value_usd) : 'n/a']
    ].forEach(function (f) {
      facts.appendChild(el('div', { class: 'fact' }, el('span', { text: f[0] }), el('b', { text: f[1] })));
    });
    document.getElementById('snap-date').textContent = 'Snapshot ' + DATA.as_of;
    document.getElementById('model-tag').textContent = DATA.model_version + ' model';
    document.getElementById('formula').textContent =
      'implied = round( launchProb × TVL × sector × (1 + 0.30 × tanh(growth / 30)) × (1 + 0.05 × (chains − 1)) ),  launchProb in [0.15, 0.92] from age, growth, breadth, log TVL';
    document.getElementById('prov-text').textContent =
      'Data: DefiLlama protocol index, fetched once for this snapshot (' + DATA.as_of + '), floor $' +
      Math.round(DATA.floor_usd / 1e6) + 'M. Source record: ' + DATA.source + '. ' +
      DATA.rows.length + ' pre-token rows ranked; ' + DATA.live.length + ' live-token protocols set aside with market caps. No live data is fetched: the page is a static snapshot of that one fetch.';
  }

  function render() {
    document.getElementById('tab-pre').setAttribute('aria-selected', state.tab === 'pre-token' ? 'true' : 'false');
    document.getElementById('tab-live').setAttribute('aria-selected', state.tab === 'live' ? 'true' : 'false');
    document.querySelector('#board thead button[data-sort="implied"]').textContent = state.tab === 'live' ? 'Market cap' : 'Implied value';
    if (state.tab === 'live') {
      liveRows();
      emptyEl.hidden = true;
      countEl.textContent = DATA.live.length + ' live-token protocols';
      document.querySelector('#board caption').textContent = 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.';
    } else {
      var list = sorted(filtered());
      boardRows(list);
      emptyEl.hidden = list.length > 0;
      countEl.textContent = list.length + ' of ' + DATA.board_size + ' rows shown';
      document.querySelector('#board caption').textContent = 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.';
    }
    writeHash();
  }

  function init() {
    readHash();
    renderFacts();
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    fillSelect('category', cats);
    fillSelect('chain', chains);
    document.getElementById('risk').value = state.risk;
    document.getElementById('watchlist-only').checked = state.wl;
    document.getElementById('q').value = state.q;

    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
    document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; render(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
    document.getElementById('risk').addEventListener('change', function (e) { state.risk = e.target.value; render(); });
    document.getElementById('watchlist-only').addEventListener('change', function (e) { state.wl = e.target.checked; render(); });
    document.getElementById('tab-pre').addEventListener('click', function () { state.tab = 'pre-token'; render(); });
    document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; render(); });
    document.getElementById('clear').addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.risk = 'all'; state.wl = false;
      document.getElementById('q').value = ''; document.getElementById('category').value = 'all';
      document.getElementById('chain').value = 'all'; document.getElementById('risk').value = 'all';
      document.getElementById('watchlist-only').checked = false; render();
    });
    document.querySelectorAll('#board thead button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        render();
      });
    });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
    render();
    if (state.selected) openDetail(state.selected);
  }

  // Rows need the watchlist flag for the filter; it is attached here from the
  // board's own watchlist list before first render.
  if (DATA.watchlist && DATA.rows) {
    var set = new Set(DATA.watchlist);
    DATA.rows.forEach(function (r) { r.on_watchlist = set.has(r.slug); });
  }
  init();
})();
