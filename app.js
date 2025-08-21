// Alerts + Watchlist with cleaner summary formatting
const gridEl = document.getElementById('grid');
const tpl = document.getElementById('tile-template');
const alertsTableWrap = document.getElementById('alertsTableWrap');
const asofEl = document.getElementById('asofDate');

const KEY_STATE = 'mw_state_v4';
let state = JSON.parse(localStorage.getItem(KEY_STATE) || '{}');

function saveState(){ localStorage.setItem(KEY_STATE, JSON.stringify(state)); }
function resetState(){ state = { hidden:{}, entered:{}, actioned:{} }; saveState(); renderAll(); }

document.getElementById('resetState').addEventListener('click', resetState);
document.getElementById('refreshData').addEventListener('click', renderAll);
document.getElementById('exportActions').addEventListener('click', exportActionsCsv);

async function loadJSON(path){
  const res = await fetch(path + '?_=' + Date.now());
  if(!res.ok) throw new Error('Failed to load ' + path);
  return res.json();
}

async function loadAll(){
  const [watch, alerts, prices, config] = await Promise.all([
    loadJSON('data.json'),
    loadJSON('alerts.json'),
    loadJSON('prices.json'),
    loadJSON('config.json').catch(()=>({ githubLogging: null, googleAppsScript: null }))
  ]);
  return {watch, alerts, prices, config};
}

function fmt(n){ if(n==null) return '—'; return (typeof n==='number') ? (''+n) : n; }

function evaluateTicker(ticker, rules, px){
  if(!px) return null;
  const hi = +px.high, lo = +px.low, prevClose = +px.prev_close, prevLow = +px.prev_low;
  let breaches = [];
  if(rules.above != null && hi >= rules.above) breaches.push({level: 'above ' + rules.above, dir:'above'});
  if(rules.below != null && lo <= rules.below) breaches.push({level: 'below ' + rules.below, dir:'below'});
  if(rules.pct_above_prior_close != null && prevClose){
    const thr = prevClose * (1 + rules.pct_above_prior_close/100);
    if(hi >= thr) breaches.push({level: `≥ prior close +${rules.pct_above_prior_close}% (${thr.toFixed(4)})`, dir:'above'});
  }
  if(rules.below_prior_low && prevLow && lo < prevLow){
    breaches.push({level: `below prior low (${prevLow})`, dir:'below'});
  }
  return breaches.length ? breaches : null;
}

function implicationFor(breach){
  return breach.dir==='above' ? 'Review entry' : breach.dir==='below' ? 'Review/exit' : 'Review';
}

function renderAlerts(alerts, prices, config){
  const date = prices.asof || 'YYYY-MM-DD';
  asofEl.textContent = date;

  const rows = [];
  alerts.rules.forEach(r=>{
    const t = r.ticker;
    const px = prices.prices[t];
    const breaches = evaluateTicker(t, r, px);
    const ohlc = px ? `O/H/L/C ${fmt(px.open)}/${fmt(px.high)}/${fmt(px.low)}/${fmt(px.close)}` : '—';
    if(breaches){
      breaches.forEach(b=> rows.push({ ticker:t, level:b.level, dir:b.dir, implication:implicationFor(b), ohlc, date }));
    } else {
      rows.push({ ticker:t, level:'No alert', dir:'', implication:'Review', ohlc, date });
    }
  });

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th style="min-width:120px;">Ticker</th>
        <th style="min-width:160px;">Level</th>
        <th style="min-width:140px;">Implication</th>
        <th style="min-width:220px;">Evidence</th>
        <th class="small" style="min-width:160px;">Action</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');

  const dayKey = rows[0]?.date || new Date().toISOString().slice(0,10);
  if(!state.actioned) state.actioned = {};
  if(!state.actioned[dayKey]) state.actioned[dayKey] = {};

  rows.forEach(r=>{
    const tr = document.createElement('tr');
    if(r.dir==='above') tr.classList.add('hit-above');
    if(r.dir==='below') tr.classList.add('hit-below');

    const gh = config.githubLogging;
    if(gh && gh.owner && gh.repo){
      const title = encodeURIComponent(`Action: ${r.ticker} — ${r.level} on ${r.date}`);
      const body = encodeURIComponent(`Ticker: ${r.ticker}\nDate: ${r.date}\nLevel: ${r.level}\nImplication: ${r.implication}\n${r.ohlc}\n\n(Submitted from dashboard)`);
      r.issueLink = `https://github.com/${gh.owner}/${gh.repo}/issues/new?title=${title}&body=${body}`;
    }

    const isActioned = !!state.actioned[dayKey][r.ticker];
    const actionBtn = document.createElement('button');
    actionBtn.className = 'btn';
    actionBtn.textContent = isActioned ? 'Actioned ✓' : 'Mark actioned';
    actionBtn.addEventListener('click', async ()=>{
      state.actioned[dayKey][r.ticker] = { action: 'actioned', time: Date.now(), level: r.level, implication: r.implication };
      saveState();
      renderAlerts(alerts, prices, config);

      const gas = config.googleAppsScript;
      if(gas && gas.webAppUrl){
        const payload = { date: dayKey, ticker: r.ticker, level: r.level, implication: r.implication, evidence: r.ohlc, timestamp_iso: new Date().toISOString(), page: location.href };
        try{ await fetch(gas.webAppUrl, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); }catch(e){ console.error('GAS logging failed', e); }
      }
    });

    tr.innerHTML = `
      <td><strong>${r.ticker}</strong><div class="small">${r.date}</div></td>
      <td><span class="badge">${r.level}</span></td>
      <td>${r.implication}</td>
      <td class="evidence">${r.ohlc}</td>
      <td></td>
    `;
    tr.querySelector('td:last-child').appendChild(actionBtn);
    if(r.issueLink){
      const a = document.createElement('a');
      a.className = 'btn-link';
      a.href = r.issueLink;
      a.target = '_blank';
      a.textContent = 'Log to GitHub';
      tr.querySelector('td:last-child').appendChild(document.createTextNode(' '));
      tr.querySelector('td:last-child').appendChild(a);
    }
    tbody.appendChild(tr);
  });

  alertsTableWrap.innerHTML = '';
  alertsTableWrap.appendChild(table);
}

function renderGrid(data){
  gridEl.innerHTML = '';
  (data.stocks || []).forEach(item => {
    const { ticker, support, resistance, entry, exit } = item;
    if(state.hidden?.[ticker]) return;

    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector('.ticker').textContent = ticker;
    node.querySelector('.support').textContent = support ?? '—';
    node.querySelector('.resistance').textContent = resistance ?? '—';
    node.querySelector('.entry').textContent = entry ?? '—';
    node.querySelector('.exit').textContent = exit ?? '—';

    const pill = node.querySelector('.status-pill');
    if(state.entered?.[ticker]) { pill.hidden = false; pill.textContent = 'Entered'; }

    node.querySelector('.enter').addEventListener('click', ()=>{
      state.entered = state.entered || {};
      state.entered[ticker] = !state.entered[ticker];
      saveState();
      renderGrid(data);
    });

    node.querySelector('.remove').addEventListener('click', ()=>{
      state.hidden = state.hidden || {};
      state.hidden[ticker] = true;
      saveState();
      renderGrid(data);
    });

    gridEl.appendChild(node);
  });
}

function exportActionsCsv(){
  const rows = [["date","ticker","action","level","implication","timestamp"]];
  for (const [date, tickers] of Object.entries(state.actioned || {})){
    for (const [t, info] of Object.entries(tickers)){
      rows.push([date, t, info.action, info.level || '', info.implication || '', new Date(info.time).toISOString()]);
    }
  }
  const csv = rows.map(r=>r.map(c=>`"${String(c).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'actions.csv';
  a.click();
}

async function renderAll(){
  try{
    const data = await loadAll();
    renderAlerts(data.alerts, data.prices, data.config);
    renderGrid(data.watch);
  }catch(e){
    alertsTableWrap.textContent = 'Error loading files. Ensure data.json, alerts.json, prices.json exist.';
    console.error(e);
  }
}
renderAll();
