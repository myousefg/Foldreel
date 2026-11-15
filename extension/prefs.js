// Extension-side preferences, kept in chrome.storage.local so the popup, the
// options page and the hover content script all read the same values (and the
// content script reacts to changes live, no page reload needed).
//
//   hoverEnabled      the floating download button on images/videos, globally
//   hoverHiddenHosts  hostnames (no "www.") where it stays hidden regardless

const Prefs = {
  defaults: { hoverEnabled: true, hoverHiddenHosts: [] },

  get() {
    return chrome.storage.local.get(this.defaults);
  },

  normalizeHost(input) {
    return String(input || '')
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/[/?#].*$/, '')
      .replace(/:\d+$/, '')
      .replace(/^www\./, '');
  },

  setHoverEnabled(enabled) {
    return chrome.storage.local.set({ hoverEnabled: !!enabled });
  },

  async setHostHidden(host, hidden) {
    const h = this.normalizeHost(host);
    if (!h) return;
    const { hoverHiddenHosts } = await this.get();
    const next = hoverHiddenHosts.filter((x) => x !== h);
    if (hidden) next.push(h);
    await chrome.storage.local.set({ hoverHiddenHosts: next.sort() });
  },
};
