// Extension-side preferences, kept in chrome.storage.local so the popup, the
// options page and the hover content script all read the same values (and the
// content script reacts to changes live, no page reload needed).
//
//   hoverEnabled      the floating download button on images/videos, globally
//   hoverHiddenHosts  hostnames (no "www.") where it stays hidden regardless; a host also covers its subdomains
//   popupsEnabled     the pop-up and overlay blocker, globally
//   popupsAllowedHosts hostnames where the blocker stays off regardless
//   popupsCloseTabs   close a tab that an ad page opened (a redirect to another site)

const Prefs = {
  defaults: { hoverEnabled: true, hoverHiddenHosts: [], popupsEnabled: true, popupsAllowedHosts: [], popupsCloseTabs: true },

  get() {
    return chrome.storage.local.get(this.defaults);
  },

  // Is `host` one of the listed hostnames, or a subdomain of one?
  hostIn(list, host) {
    return !!host && (list || []).some((h) => host === h || host.endsWith(`.${h}`));
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

  setPopupsEnabled(enabled) {
    return chrome.storage.local.set({ popupsEnabled: !!enabled });
  },

  // The list minus what `host` replaces. Adding "example.com" drops its subdomains (now covered);
  // removing "m.example.com" also drops "example.com", or the site would stay switched off.
  _without(list, host, adding) {
    return list.filter((x) => (adding ? !(x === host || x.endsWith(`.${host}`)) : !(host === x || host.endsWith(`.${x}`))));
  },

  async setPopupsAllowed(host, allowed) {
    const h = this.normalizeHost(host);
    if (!h) return;
    const { popupsAllowedHosts } = await this.get();
    const next = this._without(popupsAllowedHosts, h, allowed);
    if (allowed) next.push(h);
    await chrome.storage.local.set({ popupsAllowedHosts: next.sort() });
  },

  async setHostHidden(host, hidden) {
    const h = this.normalizeHost(host);
    if (!h) return;
    const { hoverHiddenHosts } = await this.get();
    const next = this._without(hoverHiddenHosts, h, hidden);
    if (hidden) next.push(h);
    await chrome.storage.local.set({ hoverHiddenHosts: next.sort() });
  },
};
