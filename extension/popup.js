// Popup for the toolbar button. Runs in its own context (separate from
// background.js's service worker), so it reaches the pairing secret and
// Foldreel's API only through messages to the background script. Pairing
// itself talks to /api/extension/ping directly, since storing the secret is a
// plain chrome.storage.local write.

const API_HOST = 'http://127.0.0.1:8767';

const $ = (id) => document.getElementById(id);
const el = {
  conn: $('conn'), connText: $('conn-text'),
  pair: $('pair'), pairCode: $('pair-code'), pairConnect: $('pair-connect'),
  sendArea: $('send-area'), pageTitle: $('page-title'), url: $('url'),
  mediaDetect: $('media-detect'), mediaUse: $('media-use'), mediaUrl: $('media-url'),
  ytRow: $('yt-row'), quality: $('quality'), format: $('format'),
  send: $('send'), siteHeading: $('site-heading'),
  hoverSite: $('hover-site'), hoverDesc: $('hover-desc'), hoverAll: $('hover-all'),
  popupsSite: $('popups-site'), popupsDesc: $('popups-desc'), popupsAll: $('popups-all'),
  cookieDesc: $('cookie-desc'), sendCookies: $('send-cookies'),
  status: $('status'), openSettings: $('open-settings'),
  disconnect: $('disconnect-link'), version: $('version'),
};

el.version.textContent = `v${chrome.runtime.getManifest().version}`;

let currentUrl = '';
let currentHost = '';
let capturedMediaUrl = '';
let capturedReferer = '';
let currentTabId = null;

function isYoutube(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com';
  } catch {
    return false;
  }
}

function setStatus(text, kind) {
  el.status.textContent = text;
  el.status.className = `status${kind ? ` ${kind}` : ''}`;
}

const FAILURES = {
  'not-paired': 'Not connected yet.',
  offline: "Couldn't reach Foldreel. Is it running?",
  unauthorized: 'The pairing code has expired. Paste a new one.',
  'no-cookies': 'No cookies here. Log in first.',
};
const failureText = (r) => FAILURES[r?.reason] || 'Something went wrong.';

function timeAgo(iso) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(seconds)) return '';
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
  }
  return 'just now';
}

// ── Connection ──────────────────────────────────────────────────────────────
const CONN = {
  'not-paired': ['Not connected', 'warn'],
  offline: ['Foldreel is closed', 'bad'],
  unauthorized: ['Pairing revoked', 'bad'],
  error: ['Error', 'bad'],
};

async function refreshConnection() {
  const result = await chrome.runtime.sendMessage({ type: 'status' });
  const connected = !!result?.ok;
  el.pair.hidden = connected;
  el.sendArea.hidden = !connected;
  el.disconnect.hidden = !connected;
  if (connected) {
    el.conn.className = 'pill ok';
    el.connText.textContent = 'Connected';
    refreshCookieStatus();
    return;
  }
  const [text, kind] = CONN[result?.reason] || CONN.error;
  el.conn.className = `pill ${kind}`;
  el.connText.textContent = text;
}

// ── Settings ────────────────────────────────────────────────────────────────
// Each feature has a switch for every site and one for the site in the tab. The site one only matters
// while the every-site one is on, and a host in the list also covers its subdomains.
async function refreshHover() {
  const { hoverEnabled, hoverHiddenHosts } = await Prefs.get();
  const globallyOff = hoverEnabled === false;
  el.hoverAll.checked = !globallyOff;
  el.hoverSite.disabled = globallyOff || !currentHost;
  el.hoverSite.checked = !globallyOff && !Prefs.hostIn(hoverHiddenHosts, currentHost);
  el.hoverDesc.textContent = globallyOff ? 'Off on every site' : '';
  el.hoverDesc.hidden = !el.hoverDesc.textContent;
}

async function refreshPopups() {
  const { popupsEnabled, popupsAllowedHosts } = await Prefs.get();
  const globallyOff = popupsEnabled === false;
  const on = !globallyOff && !Prefs.hostIn(popupsAllowedHosts, currentHost);
  el.popupsAll.checked = !globallyOff;
  el.popupsSite.disabled = globallyOff || !currentHost;
  el.popupsSite.checked = on;
  if (globallyOff) el.popupsDesc.textContent = 'Off on every site';
  else if (!on) el.popupsDesc.textContent = 'Off here';
  else {
    let count = 0;
    try { count = (await chrome.runtime.sendMessage({ type: 'popups-count', tabId: currentTabId }))?.count || 0; } catch { /* no background yet */ }
    el.popupsDesc.textContent = count ? `Stopped ${count} on this page` : '';
  }
  el.popupsDesc.hidden = !el.popupsDesc.textContent;
}

async function refreshCookieStatus() {
  if (!currentHost) {
    el.cookieDesc.textContent = "Can't be read from this page";
    el.sendCookies.disabled = true;
    return;
  }
  const status = await chrome.runtime.sendMessage({ type: 'cookie-status', url: currentUrl });
  if (status?.ok && status.exists) {
    el.cookieDesc.textContent = `Saved ${timeAgo(status.updated_at)} · ${status.cookies} cookies`;
    el.sendCookies.textContent = 'Replace';
  } else if (status?.ok) {
    el.cookieDesc.textContent = 'Not saved yet';
    el.sendCookies.textContent = 'Add';
  } else {
    el.cookieDesc.textContent = 'Share this site’s login';
    el.sendCookies.textContent = 'Add';
  }
}

el.hoverSite.addEventListener('change', async () => {
  await Prefs.setHostHidden(currentHost, !el.hoverSite.checked);
  refreshHover();
});
el.hoverAll.addEventListener('change', async () => {
  await Prefs.setHoverEnabled(el.hoverAll.checked);
  refreshHover();
});

el.popupsSite.addEventListener('change', async () => {
  await Prefs.setPopupsAllowed(currentHost, !el.popupsSite.checked);
  refreshPopups();
});
el.popupsAll.addEventListener('change', async () => {
  await Prefs.setPopupsEnabled(el.popupsAll.checked);
  refreshPopups();
});

el.sendCookies.addEventListener('click', async () => {
  el.sendCookies.disabled = true;
  setStatus('');
  let result;
  try {
    result = await chrome.runtime.sendMessage({ type: 'export-cookies', url: currentUrl });
  } catch {
    result = { ok: false, reason: 'error' };
  }
  el.sendCookies.disabled = false;
  if (!result?.ok) {
    setStatus(failureText(result), 'bad');
    if (result?.reason !== 'no-cookies') refreshConnection();
    return;
  }
  setStatus('');
  refreshCookieStatus();
});

// ── Sending the page ────────────────────────────────────────────────────────
// Quality is a video-resolution filter; it does nothing once yt-dlp is
// extracting audio only, so there's no point showing it for MP3.
el.format.addEventListener('change', () => {
  el.quality.hidden = el.format.value === 'mp3';
  chrome.storage.local.set({ ytFormat: el.format.value });
});
el.quality.addEventListener('change', () => chrome.storage.local.set({ ytQuality: el.quality.value }));

el.send.addEventListener('click', async () => {
  el.send.disabled = true;
  setStatus('');
  const useDetected = !el.mediaDetect.hidden && el.mediaUse.value === 'direct' && capturedMediaUrl;
  const options = {};
  if (useDetected) {
    // The CDN this points at almost always hotlink-checks the Referer, the
    // same way a real browser tab would send it - the current page is that
    // referer: the page that actually requested this URL (it may be a
    // player frame on another site), else the tab's own page.
    options.referer = capturedReferer || currentUrl;
  } else if (!el.ytRow.hidden) {
    if (!el.quality.hidden && el.quality.value !== 'best') options.quality = el.quality.value;
    if (el.format.value !== 'mp4') options.format = el.format.value;
  }
  let result;
  try {
    result = await chrome.runtime.sendMessage({
      type: 'send',
      urls: [useDetected ? capturedMediaUrl : currentUrl],
      options: Object.keys(options).length ? options : undefined,
    });
  } catch {
    result = { ok: false, reason: 'error' };
  }
  if (result?.ok) {
    el.send.textContent = 'Sent';
    setTimeout(() => window.close(), 700);
    return;
  }
  setStatus(failureText(result), 'bad');
  el.send.disabled = false;
  refreshConnection();
});

// ── Pairing ─────────────────────────────────────────────────────────────────
el.pair.addEventListener('submit', async (e) => {
  e.preventDefault();
  const secret = el.pairCode.value.trim();
  if (!secret) return;
  el.pairConnect.disabled = true;
  setStatus('Checking…');
  let ok = false;
  try {
    const res = await fetch(`${API_HOST}/api/extension/ping`, {
      headers: { 'X-Foldreel-Extension-Token': secret },
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  el.pairConnect.disabled = false;
  if (!ok) {
    setStatus('Wrong code, or Foldreel is closed', 'bad');
    return;
  }
  await chrome.storage.local.set({ secret });
  el.pairCode.value = '';
  setStatus('');
  refreshConnection();
});

el.disconnect.addEventListener('click', async (e) => {
  e.preventDefault();
  await chrome.storage.local.remove('secret');
  setStatus('');
  refreshConnection();
});

el.openSettings.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentUrl = tab?.url || '';
  const sendable = /^https?:\/\//.test(currentUrl);
  try { currentHost = sendable ? Prefs.normalizeHost(new URL(currentUrl).hostname) : ''; } catch { currentHost = ''; }

  el.pageTitle.textContent = sendable ? (tab?.title || currentHost) : 'This page can’t be sent';
  el.url.textContent = sendable ? currentUrl : 'Open a regular website first.';
  el.send.disabled = !sendable;
  el.siteHeading.textContent = currentHost || 'This page';
  currentTabId = tab?.id ?? null;
  el.ytRow.hidden = !isYoutube(currentUrl);
  const saved = await chrome.storage.local.get({ ytQuality: 'best', ytFormat: 'mp4' });
  if ([...el.quality.options].some((o) => o.value === saved.ytQuality)) el.quality.value = saved.ytQuality;
  if ([...el.format.options].some((o) => o.value === saved.ytFormat)) el.format.value = saved.ytFormat;
  el.quality.hidden = el.format.value === 'mp3';

  if (tab?.id != null) {
    const captured = await chrome.runtime.sendMessage({ type: 'captured-media', tabId: tab.id });
    if (captured?.url) {
      capturedMediaUrl = captured.url;
      capturedReferer = captured.referer || '';
      el.mediaUrl.textContent = captured.url;
      el.mediaDetect.hidden = false;
    }
  }

  refreshHover();
  refreshPopups();
  refreshConnection();
  // A change made on the settings page, or in another popup, shows up here too.
  chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') { refreshHover(); refreshPopups(); } });
}

init();
