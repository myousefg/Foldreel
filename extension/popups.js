// Foldreel browser extension - pop-up and overlay blocker, extension half.
//
// popups-main.js does the blocking inside the page, where it has to run; it
// cannot read chrome.storage. This script runs in the extension's own
// isolated world: it reads the settings, tells the page script whether the
// blocker is on for this site (an attribute on <html>), counts what was
// stopped, and answers the toolbar popup. Nothing here is sent anywhere
// except to this extension's own background script.
(() => {
  const ATTR = 'data-foldreel-popups';
  const norm = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

  // The site the person is on: for an ad iframe that is the page around it, not the ad's own host.
  const siteHost = (() => {
    try {
      const top = window === window.top ? location.origin : location.ancestorOrigins[location.ancestorOrigins.length - 1];
      return norm(new URL(top).hostname);
    } catch (_) {
      return norm(location.hostname);
    }
  })();

  let enabled = true;
  let allowed = [];

  function apply() {
    const root = document.documentElement;
    if (!root) { setTimeout(apply, 10); return; }
    // "example.com" in the list also covers m.example.com and every other subdomain.
    const isAllowed = allowed.some((h) => siteHost === h || siteHost.endsWith(`.${h}`));
    root.setAttribute(ATTR, enabled && !isAllowed ? 'on' : 'off');
  }

  chrome.storage.local.get({ popupsEnabled: true, popupsAllowedHosts: [] }).then((v) => {
    enabled = v.popupsEnabled !== false;
    allowed = v.popupsAllowedHosts || [];
    apply();
  }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.popupsEnabled) enabled = changes.popupsEnabled.newValue !== false;
    if (changes.popupsAllowedHosts) allowed = changes.popupsAllowedHosts.newValue || [];
    apply();
  });

  // Count for the toolbar popup, batched so a page that fires hundreds of attempts sends a few messages.
  let pending = 0;
  let timer = null;
  document.addEventListener('foldreel-blocked', () => {
    pending += 1;
    if (timer) return;
    timer = setTimeout(() => {
      const n = pending;
      pending = 0;
      timer = null;
      try { chrome.runtime.sendMessage({ type: 'popups-blocked', n }).catch(() => {}); } catch (_) { /* extension was reloaded */ }
    }, 400);
  });
})();
