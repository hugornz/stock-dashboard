// simplified for brevity, includes eval + render
const gridEl=document.getElementById('grid');
const tpl=document.getElementById('tile-template');
const alertsTableWrap=document.getElementById('alertsTableWrap');
const KEY_STATE='mw_state_v2';
let state=JSON.parse(localStorage.getItem(KEY_STATE)||'{}');
function saveState(){localStorage.setItem(KEY_STATE,JSON.stringify(state));}
function resetState(){state={hidden:{},entered:{},actioned:{}};saveState();renderAll();}
document.getElementById('resetState').addEventListener('click',resetState);
document.getElementById('refreshData').addEventListener('click',renderAll);
document.getElementById('exportActions').addEventListener('click',exportActionsCsv);
async function loadJSON(p){const r=await fetch(p+'?'+Date.now());return r.json();}
async function loadAll(){const [w,a,pr,c]=await Promise.all([loadJSON('data.json'),loadJSON('alerts.json'),loadJSON('prices.json'),loadJSON('config.json').catch(()=>({}))]);return{watch:w,alerts:a,prices:pr,config:c};}
function evaluate(t,r,px){if(!px)return null;let b=[];if(r.above&&px.high>=r.above)b.push({level:'above '+r.above,dir:'above'});if(r.below&&px.low<=r.below)b.push({level:'below '+r.below,dir:'below'});if(r.pct_above_prior_close&&px.prev_close&&px.high>=px.prev_close*(1+r.pct_above_prior_close/100))b.push({level:'≥ +'+r.pct_above_prior_close+'% prev close',dir:'above'});if(r.below_prior_low&&px.prev_low&&px.low<px.prev_low)b.push({level:'below prev low',dir:'below'});return b.length?b:null;}
function implication(b){return b.dir==='above'?'Review entry':'Review/exit';}
function renderAlerts(alerts,prices,config){const date=prices.asof;const rows=[];alerts.rules.forEach(r=>{const px=prices.prices[r.ticker];const br=evaluate(r.ticker,r,px);if(br)br.forEach(b=>rows.push({ticker:r.ticker,level:b.level,implication:implication(b),date,ohlc:`O/H/L/C ${px.open}/${px.high}/${px.low}/${px.close}`}));else rows.push({ticker:r.ticker,level:'No alert',implication:'Review',date,ohlc:'—'});});let html='<table><tr><th>Ticker</th><th>Level</th><th>Implication</th><th>Evidence</th></tr>';rows.forEach(r=>{html+='<tr><td>'+r.ticker+'</td><td>'+r.level+'</td><td>'+r.implication+'</td><td>'+r.ohlc+'</td></tr>';});html+='</table>';alertsTableWrap.innerHTML=html;}
function renderGrid(d){gridEl.innerHTML='';d.stocks.forEach(s=>{if(state.hidden?.[s.ticker])return;const n=tpl.content.firstElementChild.cloneNode(true);n.querySelector('.ticker').textContent=s.ticker;n.querySelector('.support').textContent=s.support;n.querySelector('.resistance').textContent=s.resistance;n.querySelector('.entry').textContent=s.entry;n.querySelector('.exit').textContent=s.exit;n.querySelector('.enter').addEventListener('click',()=>{state.entered[s.ticker]=!state.entered[s.ticker];saveState();renderGrid(d);});n.querySelector('.remove').addEventListener('click',()=>{state.hidden[s.ticker]=true;saveState();renderGrid(d);});gridEl.appendChild(n);});}
function exportActionsCsv(){}
async function renderAll(){const d=await loadAll();renderAlerts(d.alerts,d.prices,d.config);renderGrid(d.watch);}renderAll();