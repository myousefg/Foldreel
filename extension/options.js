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

// Opening this page counts as the extension checking in, which also finishes a "Link the
// extension" started from Foldreel. The connection line follows the stored code as it changes.
chrome.runtime.sendMessage({ type: 'status' }).then(refreshConnection, () => {});
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.secret) refreshConnection(); });

$('pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const secret = codeInput.value.trim();
  if (!secret) return;
  setConn('', 'Checking…');
  if (await ping(secret) !== 'ok') {
    setConn('bad', 'Wrong code, or Foldreel is closed');
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
function renderHosts(listEl, hosts, { button, label, empty, onClick }) {
  listEl.textContent = '';
  if (!hosts.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = empty;
    listEl.append(li);
    return;
  }
  for (const host of hosts) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = host;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small';
    btn.textContent = button;
    btn.setAttribute('aria-label', label(host));
    btn.addEventListener('click', () => onClick(host));
    li.append(name, btn);
    listEl.append(li);
  }
}

async function renderPrefs() {
  const { hoverEnabled, hoverHiddenHosts, popupsEnabled, popupsAllowedHosts, popupsCloseTabs } = await Prefs.get();
  $('popups-close').checked = popupsCloseTabs !== false;
  $('hover-enabled').checked = hoverEnabled !== false;
  renderHosts(hostsEl, hoverHiddenHosts, {
    button: 'Show again', label: (h) => `Show the button on ${h} again`,
    empty: 'None', onClick: (h) => Prefs.setHostHidden(h, false),
  });
  $('popups-enabled').checked = popupsEnabled !== false;
  renderHosts($('allowed-hosts'), popupsAllowedHosts, {
    button: 'Block again', label: (h) => `Block pop-ups on ${h} again`,
    empty: 'None', onClick: (h) => Prefs.setPopupsAllowed(h, false),
  });
}

$('hover-enabled').addEventListener('change', (e) => Prefs.setHoverEnabled(e.target.checked));
$('popups-enabled').addEventListener('change', (e) => Prefs.setPopupsEnabled(e.target.checked));
$('popups-close').addEventListener('change', (e) => chrome.storage.local.set({ popupsCloseTabs: e.target.checked }));

$('allowed-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('allowed-input');
  const host = Prefs.normalizeHost(input.value);
  if (!host || !host.includes('.')) { input.focus(); return; }
  await Prefs.setPopupsAllowed(host, true);
  input.value = '';
});

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
