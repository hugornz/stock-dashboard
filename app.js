// Simple client-side dashboard using data.json + localStorage state
const gridEl = document.getElementById('grid');
const tpl = document.getElementById('tile-template');
const KEY_STATE = 'mw_state_v1';

let state = JSON.parse(localStorage.getItem(KEY_STATE) || '{}'); // format: { hidden: {TICKER: true}, entered: {TICKER: true} }

function saveState() {
  localStorage.setItem(KEY_STATE, JSON.stringify(state));
}

function resetState() {
  state = { hidden: {}, entered: {} };
  saveState();
  render();
}

async function loadData() {
  const res = await fetch('data.json?_=' + Date.now());
  if (!res.ok) throw new Error('Failed to load data.json');
  const json = await res.json();
  return json;
}

function renderTile(item) {
  const { ticker, support, resistance, entry, exit } = item;
  if (state.hidden?.[ticker]) return; // skip hidden

  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelector('.ticker').textContent = ticker;
  node.querySelector('.support').textContent = support ?? '—';
  node.querySelector('.resistance').textContent = resistance ?? '—';
  node.querySelector('.entry').textContent = entry ?? '—';
  node.querySelector('.exit').textContent = exit ?? '—';

  // status
  const pill = node.querySelector('.status-pill');
  if (!state.entered) state.entered = {};
  if (state.entered[ticker]) {
    pill.hidden = false;
    pill.textContent = 'Entered';
  }

  // actions
  node.querySelector('.enter').addEventListener('click', () => {
    state.entered[ticker] = !state.entered[ticker];
    saveState();
    render();
  });

  node.querySelector('.remove').addEventListener('click', () => {
    if (!state.hidden) state.hidden = {};
    state.hidden[ticker] = true;
    saveState();
    render();
  });

  gridEl.appendChild(node);
}

async function render() {
  gridEl.innerHTML = '';
  let data;
  try {
    data = await loadData();
  } catch (e) {
    gridEl.textContent = 'Error loading data.json. Make sure the file exists.';
    console.error(e);
    return;
  }
  data.stocks.forEach(renderTile);
}

// buttons
document.getElementById('resetState').addEventListener('click', resetState);
document.getElementById('refreshData').addEventListener('click', render);

// initial
render();
