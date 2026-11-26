// Foldreel browser extension - pop-up and overlay blocker, page half.
//
// Runs in the page's own JavaScript world (manifest: world MAIN) so it can stand
// between the page and window.open, and in every frame, since pop-up scripts
// often live in an ad iframe. It does three things:
//
//   1. Stops pop-ups and pop-unders: window.open and script-made target=_blank
//      clicks go through unless a real person just pressed a real control.
//   2. Hides invisible layers that sit on top of a page to catch clicks: a
//      see-through full-window <div>, or a see-through <a> laid over a video.
//   3. On pages that have already tried the above, also hides floating ad
//      boxes pinned to a corner of the window.
//
// Hidden things are never deleted, only hidden, so a page built by a framework
// keeps working when it removes them itself. The isolated half (popups.js)
// tells this script whether it is switched on, through an attribute on <html>,
// and counts what was stopped.
(() => {
  'use strict';
  if (window.__foldreelPopups) return;
  Object.defineProperty(window, '__foldreelPopups', { value: true });

  const ATTR = 'data-foldreel-popups';
  const HIDDEN_ATTR = 'data-foldreel-hidden';
  const isTop = window === window.top;
  const isOn = () => document.documentElement?.getAttribute(ATTR) !== 'off';

  let aggressive = false; // this page has shown pop-up behaviour: be stricter about floating ads
  const report = (kind) => {
    aggressive = true;
    try { document.dispatchEvent(new CustomEvent('foldreel-blocked', { detail: kind })); } catch (_) { /* ignore */ }
  };

  // ── what the person last did ───────────────────────────────────────────────
  let last = { t: -1e9, target: null };
  const note = (e) => { if (e.isTrusted) last = { t: performance.now(), target: e.target }; };
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'touchstart', 'keydown']) {
    window.addEventListener(type, note, true);
  }

  // ── geometry and style helpers ─────────────────────────────────────────────
  const vw = () => window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = () => window.innerHeight || document.documentElement.clientHeight || 0;
  const CHAT = /intercom|drift|crisp|tawk|zendesk|zdassets|hubspot|tidio|livechat|olark|freshchat|chatra|helpscout|messenger|whatsapp/i;
  const KEEP = '[role="presentation"],[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="tooltip"],[aria-modal="true"],dialog,[popover]';

  function hasContent(el) {
    if (el.textContent && el.textContent.trim()) return true;
    if (el.getAttribute('aria-label') || el.getAttribute('title')) return true; // a labelled link is a real control
    return !!el.querySelector('img,picture,video,audio,svg,canvas,iframe,input,button,textarea,select,object,embed');
  }

  function clearBackground(cs) {
    const bg = cs.backgroundColor;
    const clear = bg === 'transparent' || /^rgba\(.*,\s*0\)$/.test(bg);
    return clear && cs.backgroundImage === 'none' && parseFloat(cs.borderTopWidth) === 0 && cs.boxShadow === 'none';
  }

  // Does the layer sit over a big part of the window, or over most of the box it lives in (a player)?
  // `anyBox` accepts any container; otherwise the box must hold a video, frame, canvas or picture.
  function covers(el, r, anyBox) {
    const area = r.width * r.height;
    if (area >= 0.3 * vw() * vh()) return true;
    const p = el.parentElement;
    if (p && p !== document.body && p !== document.documentElement) {
      const pr = p.getBoundingClientRect();
      const pa = pr.width * pr.height;
      if (pa >= 20000 && area >= 0.7 * pa && (anyBox || p.querySelector('video,iframe,canvas,img'))) return true;
    }
    return false;
  }

  function crossOrigin(href) {
    try { return new URL(href, location.href).origin !== location.origin; } catch (_) { return false; }
  }

  const TAGS = /^(DIV|A|SPAN|SECTION|ASIDE|IFRAME|INS|LABEL)$/;
  const AD_TITLE = /offer|advert|sponsor|promo|\bads?\b|banner|pop-?up|interstitial/i;

  // An ad injected by script: a box pinned to the window at the very top of the stacking order whose
  // only content is a frame with no address of its own (the script writes the ad into it). Whole-window
  // ones are the "invisible wall" that eats the click; corner ones are the floating offers.
  function isScriptAdFrame(el, cs, r, z) {
    if (z < 1000000 || el.tagName === 'IFRAME') return false;
    if (el.children.length !== 1 || el.firstElementChild.tagName !== 'IFRAME') return false;
    if (el.textContent && el.textContent.trim()) return false;
    const f = el.firstElementChild;
    const src = f.getAttribute('src');
    if (src && src !== 'about:blank') return false;
    if (CHAT.test(`${f.title} ${f.id} ${el.id} ${el.className}`)) return false;
    if (AD_TITLE.test(f.title || '')) return true;
    return cs.position === 'fixed' && r.width >= 0.85 * vw() && r.height >= 0.85 * vh();
  }

  // 'link' | 'overlay' | 'ad' | '' for an element that is on the page right now.
  function classify(el) {
    if (!(el instanceof HTMLElement) || !TAGS.test(el.tagName) || el.hasAttribute(HIDDEN_ATTR)) return '';
    if (el.closest('#foldreel-hover-root')) return '';
    const cs = getComputedStyle(el);
    const pos = cs.position;
    if (pos !== 'fixed' && pos !== 'absolute') return '';
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return '';
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return '';
    if (el.closest(KEEP)) return ''; // backdrops of real menus and dialogs
    const z = parseInt(cs.zIndex, 10) || 0;
    if (isScriptAdFrame(el, cs, r, z)) return 'ad';

    const faint = parseFloat(cs.opacity) < 0.1;
    const seeThrough = faint || (el.tagName !== 'IFRAME' && clearBackground(cs) && !hasContent(el));
    // A link to another site that has been faded out but left clickable has no honest purpose.
    const fadedLink = faint && el.tagName === 'A' && el.hasAttribute('href');
    if (seeThrough && covers(el, r, fadedLink)) {
      if (el.tagName === 'A' && el.hasAttribute('href')) {
        // A same-site link stretched over a card is a normal design. An invisible link to
        // somewhere else, over the content, is there to catch the click.
        if (crossOrigin(el.href) && !el.hasAttribute('download') && (el.target === '_blank' || z >= 100 || pos === 'fixed')) return 'link';
      } else if (z >= 1000 || (pos === 'fixed' && r.width >= 0.85 * vw() && r.height >= 0.85 * vh() && z >= 100)) {
        return 'overlay';
      }
    }

    // Floating ad boxes: only trusted on a page that already behaved like an ad page.
    if (aggressive && isTop && pos === 'fixed' && z >= 1000 && r.width >= 100 && r.width <= 480 && r.height >= 50 && r.height <= 460) {
      const edge = r.left < 40 || r.right > vw() - 40 || r.bottom > vh() - 40;
      if (edge && !el.querySelector('input,textarea,select,video,audio,canvas,form')) {
        const frame = el.querySelector('iframe');
        if (frame && CHAT.test(frame.src || '')) return '';
        if (el.querySelector('img,iframe')) return 'ad';
      }
    }
    return '';
  }

  // ── hiding, and putting things back ────────────────────────────────────────
  const hiddenNow = new Set();
  let removals = 0;
  const MAX_HIDDEN = 300;

  function hide(el, kind) {
    if (removals >= MAX_HIDDEN || el.hasAttribute(HIDDEN_ATTR)) return;
    removals += 1;
    const prev = {};
    for (const p of ['display', 'pointer-events']) prev[p] = [el.style.getPropertyValue(p), el.style.getPropertyPriority(p)];
    el.__foldreelPrev = prev;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.setAttribute(HIDDEN_ATTR, kind);
    hiddenNow.add(el);
    report(kind);
  }

  function restoreAll() {
    for (const el of hiddenNow) {
      const prev = el.__foldreelPrev || {};
      for (const p of ['display', 'pointer-events']) {
        if (prev[p] && prev[p][0]) el.style.setProperty(p, prev[p][0], prev[p][1]); else el.style.removeProperty(p);
      }
      el.removeAttribute(HIDDEN_ATTR);
    }
    hiddenNow.clear();
    removals = 0;
  }

  // A layer that is still see-through half a second later is a trap; one that is
  // mid-fade (a dialog scrim, a toast) will have changed by then.
  const waiting = new WeakSet();
  function consider(el) {
    if (!isOn() || waiting.has(el) || !classify(el)) return;
    waiting.add(el);
    setTimeout(() => {
      waiting.delete(el);
      if (!isOn()) return;
      const kind = classify(el);
      if (kind) hide(el, kind);
    }, 600);
  }

  // ── pop-ups ────────────────────────────────────────────────────────────────
  const AUTH_HOST = /(^|\.)(accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|login\.live\.com|facebook\.com|github\.com|gitlab\.com|discord\.com|paypal\.com|stripe\.com|twitter\.com|x\.com|reddit\.com|pinterest\.com|linkedin\.com|whatsapp\.com|t\.me|telegram\.me|line\.me|vk\.com)$/i;
  const AUTH_PATH = /oauth|authori[sz]e|\/login|sign-?in|\/sso|checkout|payment|\/share|intent\/tweet/i;

  function control(node) {
    return node instanceof Element
      ? node.closest('a[href],button,[role="button"],[role="link"],input[type="button"],input[type="submit"],summary,label')
      : null;
  }

  function onHijack(node) {
    for (let n = node, i = 0; n instanceof Element && i < 4; n = n.parentElement, i += 1) {
      if (classify(n)) return n;
    }
    return null;
  }

  // Would a person plausibly have asked for this window?
  function allowOpen(url) {
    if (!isOn()) return true;
    if (performance.now() - last.t > 4000) return false; // no click behind it: a timer, or a script
    if (onHijack(last.target)) return false;            // the click landed on an invisible layer
    const c = control(last.target);
    if (!c) return false;                                // a click on plain page area, not a button or link
    let target;
    try { target = new URL(url || 'about:blank', location.href); } catch (_) { return true; }
    if (target.protocol === 'about:' || target.origin === location.origin) return true;
    try {
      if (c.tagName === 'A' && c.href && new URL(c.href, location.href).origin === target.origin) return true;
    } catch (_) { /* ignore */ }
    return AUTH_HOST.test(target.hostname) || AUTH_PATH.test(target.href); // sign-in, payment and share windows
  }

  function stubWindow() {
    const noop = () => {};
    const doc = { write: noop, writeln: noop, close: noop, open: noop };
    const loc = { href: '', assign: noop, replace: noop, reload: noop };
    return new Proxy({ closed: true, close: noop, focus: noop, blur: noop, postMessage: noop, document: doc, location: loc, opener: null },
      { set: () => true });
  }

  const realOpen = window.open;
  const guardedOpen = function open(url, ...rest) {
    if (allowOpen(url == null ? '' : String(url))) return realOpen.call(this, url, ...rest);
    report('popup');
    return stubWindow();
  };
  Object.defineProperty(guardedOpen, 'toString', { value: () => 'function open() { [native code] }' });
  try {
    Object.defineProperty(window, 'open', { value: guardedOpen, writable: true, configurable: true });
  } catch (_) {
    window.open = guardedOpen;
  }

  // a.click() on a link nobody can see, to open a tab behind the page.
  const realAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click() {
    if (isOn() && this.target && !/^_(self|top|parent)$/.test(this.target) && !this.hasAttribute('download') && !allowOpen(this.href)) {
      report('popup');
      return undefined;
    }
    return realAnchorClick.apply(this, arguments);
  };

  window.addEventListener('click', (e) => {
    if (!isOn()) return;
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    // Script-made click on a new-tab link.
    if (!e.isTrusted && a && a.target === '_blank' && !a.hasAttribute('download') && !allowOpen(a.href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      report('popup');
      return;
    }
    // A real click that landed on an invisible layer: hide the layer and swallow this click.
    if (e.isTrusted) {
      const trap = onHijack(e.target);
      if (trap) {
        e.preventDefault();
        e.stopImmediatePropagation();
        hide(trap, classify(trap) || 'overlay');
      }
    }
  }, true);

  // ── watching the page ──────────────────────────────────────────────────────
  const queue = new Set();
  let scheduled = false;
  function flush() {
    scheduled = false;
    let n = 0;
    for (const el of queue) {
      queue.delete(el);
      consider(el);
      if (++n >= 150) break;
    }
    if (queue.size) schedule();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    (window.requestIdleCallback || ((f) => setTimeout(f, 80)))(flush, { timeout: 400 });
  }
  function enqueueTree(node) {
    if (!(node instanceof Element)) return;
    queue.add(node);
    // A wrapper added with its layers inside it.
    const inner = node.querySelectorAll ? node.querySelectorAll('a[href],div,section,aside,iframe,ins') : [];
    for (let i = 0; i < inner.length && i < 60; i += 1) queue.add(inner[i]);
  }

  function start() {
    // Observe the document itself, so nodes parsed before <html> was reachable are not missed.
    new MutationObserver((records) => {
      if (!isOn()) return;
      for (const rec of records) {
        if (rec.type === 'childList') rec.addedNodes.forEach(enqueueTree);
        else enqueueTree(rec.target);
      }
      schedule();
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    const watchSwitch = () => {
      const root = document.documentElement;
      if (!root) { setTimeout(watchSwitch, 20); return; }
      // Turning the blocker off puts everything back; turning it on looks again.
      new MutationObserver(() => { if (!isOn()) restoreAll(); else sweep(true); })
        .observe(root, { attributes: true, attributeFilter: [ATTR] });
    };
    watchSwitch();

    // Layers often sit inside a wrapper that was already there, or only get their look later.
    document.addEventListener('DOMContentLoaded', () => sweep(true));
    let ticks = 0;
    const timer = setInterval(() => {
      sweep(ticks < 4);
      if (++ticks > 12) { clearInterval(timer); setInterval(() => sweep(false), 6000); }
    }, 1500);
  }

  // `deep` also looks at every link and the first few levels of the page, not just the top.
  function sweep(deep) {
    if (!isOn() || !document.body) return;
    for (const el of document.body.children) queue.add(el);
    for (const el of document.documentElement.children) if (el !== document.body && el !== document.head) queue.add(el);
    if (deep) {
      let n = 0;
      for (const el of document.body.querySelectorAll('a[href],body > * > *,body > * > * > *')) {
        queue.add(el);
        if (++n >= 600) break;
      }
    }
    schedule();
  }

  start();
})();
