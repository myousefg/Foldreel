const API_HOST = 'http://127.0.0.1:8767';

const $ = (id) => document.getElementById(id);
const conn = $('conn');
const connText = $('conn-text');
const codeInput = $('code');
const hostsEl = $('hosts');

$('version').textContent = `v${chrome.runtime.getManifest().version}`;

// ── Connection ──────────────────────────────────────────────────────────────
function setConn(kind, text) {
  conn.className = `pill ${kind}`;
  connText.textContent = text;
}

async function ping(secret) {
  try {
    const res = await fetch(`${API_HOST}/api/extension/ping`, {
      headers: { 'X-Foldreel-Extension-Token': secret },
    });
    return res.ok ? 'ok' : (res.status === 401 ? 'unauthorized' : 'error');
  } catch {
    return 'offline';
  }
}

async function refreshConnection() {
  const { secret } = await chrome.storage.local.get('secret');
  $('disconnect').hidden = !secret;
  if (!secret) { setConn('warn', 'Not connected'); return; }
  const state = await ping(secret);
  if (state === 'ok') setConn('ok', 'Connected');
  else if (state === 'offline') setConn('bad', 'Foldreel is closed');
  else setConn('bad', 'Pairing revoked');
}

$('pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const secret = codeInput.value.trim();
  if (!secret) return;
  setConn('', 'Checking…');
  if (await ping(secret) !== 'ok') {
    setConn('bad', "Couldn't connect. Is Foldreel running, and is the code current?");
    return;
  }
  await chrome.storage.local.set({ secret });
  codeInput.value = '';
  refreshConnection();
});

$('disconnect').addEventListener('click', async () => {
  await chrome.storage.local.remove('secret');
  codeInput.value = '';
  refreshConnection();
});

// ── Floating button ─────────────────────────────────────────────────────────
function renderHosts(hosts) {
  hostsEl.textContent = '';
  if (!hosts.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'None. Use the toggle in the toolbar popup on any site.';
    hostsEl.append(li);
    return;
  }
  for (const host of hosts) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = host;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small';
    btn.textContent = 'Show again';
    btn.setAttribute('aria-label', `Show the button on ${host} again`);
    btn.addEventListener('click', () => Prefs.setHostHidden(host, false));
    li.append(name, btn);
    hostsEl.append(li);
  }
}

async function renderPrefs() {
  const { hoverEnabled, hoverHiddenHosts } = await Prefs.get();
  $('hover-enabled').checked = hoverEnabled !== false;
  renderHosts(hoverHiddenHosts);
}

$('hover-enabled').addEventListener('change', (e) => Prefs.setHoverEnabled(e.target.checked));

$('host-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('host-input');
  const host = Prefs.normalizeHost(input.value);
  if (!host || !host.includes('.')) { input.focus(); return; }
  await Prefs.setHostHidden(host, true);
  input.value = '';
});

// The popup can change these too; keep this page in sync while it is open.
chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') renderPrefs(); });

refreshConnection();
renderPrefs();
