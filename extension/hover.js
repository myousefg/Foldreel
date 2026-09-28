// Foldreel browser extension - hover-to-send content script.
//
// The right-click menu (background.js) already sends a link or the page
// itself; this adds the other half - hovering an actual image or video on
// the page shows a small button right on top of it, no right-click needed.
// Runs in every page's own DOM (manifest: content_scripts, all_urls, same
// permission the media-capture webRequest listener already needed), so
// everything here is scoped through a shadow root to keep the button's own
// styling from leaking into (or being broken by) the host page's CSS.

(() => {
  const MIN_SIZE = 72; // px - skips avatars/icons/UI chrome, not real media
  const HIDE_DELAY = 250; // ms grace period moving from the media to the button

  let host = null;
  let shadow = null;
  let button = null;
  let currentEl = null;
  let hideTimer = null;

  function ensureHost() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'foldreel-hover-root';
    Object.assign(host.style, {
      position: 'fixed', top: '0', left: '0', zIndex: '2147483647',
      width: '0', height: '0', pointerEvents: 'none',
    });
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .btn {
        position: fixed;
        display: flex; align-items: center; gap: 5px;
        background: #ff5c5c; color: #1a1210;
        font: 600 11px/1 -apple-system, "Segoe UI", sans-serif;
        border: none; border-radius: 7px;
        padding: 5px 9px;
        box-shadow: 0 2px 10px rgba(0,0,0,.35);
        cursor: pointer;
        pointer-events: auto;
        opacity: 0;
        transform: translateY(2px);
        transition: opacity .1s ease, transform .1s ease, background-color .15s ease;
      }
      .btn.visible { opacity: 1; transform: translateY(0); }
      .btn.sent { background: #34d399; color: #06251a; }
      .btn.failed { background: #f87171; color: #250606; }
      .btn svg { width: 12px; height: 12px; flex: none; }
    `;
    button = document.createElement('button');
    button.className = 'btn';
    button.type = 'button';
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Foldreel</span>`;
    button.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    button.addEventListener('mouseleave', scheduleHide);
    button.addEventListener('click', onSend);
    shadow.appendChild(style);
    shadow.appendChild(button);
    document.documentElement.appendChild(host);
  }

  function mediaUrlFor(el) {
    if (el.tagName === 'IMG') {
      // data:/blob: image sources have no real per-page fallback the way a
      // video embed's page URL does, so those just don't get a button.
      const src = el.currentSrc || el.src || '';
      return /^https?:/i.test(src) ? src : '';
    }
    if (el.tagName === 'VIDEO') {
      if (el.currentSrc) return el.currentSrc;
      const source = el.querySelector('source[src]');
      return source ? source.src : (el.src || '');
    }
    return '';
  }

  function findCandidate(x, y) {
    // elementsFromPoint returns the whole z-stack at this point, not just
    // the topmost hit-testable element - closest()-from-target missed real
    // players (Twitter/X included) that render <video> underneath a
    // transparent overlay div that actually captures the click/hover, so
    // e.target was never a descendant of anything a plain ancestor walk
    // could find.
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (el.tagName !== 'IMG' && el.tagName !== 'VIDEO') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) continue;
      if (!mediaUrlFor(el)) continue;
      return { el, rect };
    }
    return null;
  }

  function showFor(el, rect) {
    ensureHost();
    currentEl = el;
    button.classList.remove('sent', 'failed');
    button.querySelector('span').textContent = 'Foldreel';
    button.style.top = `${Math.max(4, rect.top + 6)}px`;
    button.style.left = `${Math.max(4, rect.right - button.offsetWidth - 6) || rect.left + 6}px`;
    // offsetWidth is 0 before first paint - correct the left position one
    // frame later now that the button has an actual rendered width.
    requestAnimationFrame(() => {
      button.style.left = `${Math.max(4, rect.right - button.offsetWidth - 6)}px`;
    });
    button.classList.add('visible');
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      button?.classList.remove('visible');
      currentEl = null;
    }, HIDE_DELAY);
  }

  async function onSend(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!currentEl) return;
    let url = mediaUrlFor(currentEl);
    if (!url) return;
    // Always send the page URL, never the hovered element's own src. A
    // site's own extractor (gallery-dl/yt-dlp) needs the post URL to do
    // anything site-aware - X/Twitter's "GIF" detection included, which only
    // fires from the tweet URL - and the element's own src is frequently a
    // thumbnail or poster-frame rendition rather than the real file (a
    // preview <img> shown while a video loads, a feed's compressed copy of a
    // photo, etc.). mediaUrlFor() above still gates which elements count as
    // a real candidate; only the URL actually sent has changed.
    url = location.href;
    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: 'send', urls: [url] });
    } catch {
      result = { ok: false };
    }
    button.classList.toggle('sent', !!result?.ok);
    button.classList.toggle('failed', !result?.ok);
    button.querySelector('span').textContent = result?.ok ? 'Sent' : 'Failed';
    setTimeout(scheduleHide, 900);
  }

  // Throttled to ~12/s - elementsFromPoint is real DOM work, and mousemove
  // fires far more often than that needs to feel instant.
  let moveThrottle = null;
  document.addEventListener('mousemove', (e) => {
    if (moveThrottle) return;
    moveThrottle = setTimeout(() => { moveThrottle = null; }, 80);
    const candidate = findCandidate(e.clientX, e.clientY);
    if (!candidate) {
      if (currentEl) scheduleHide();
      return;
    }
    clearTimeout(hideTimer);
    if (candidate.el !== currentEl) showFor(candidate.el, candidate.rect);
  }, { passive: true });

  // Stale position beats a visible-but-wrong button - simplest fix is just
  // to hide, since a re-hover naturally reshows it in the right place.
  window.addEventListener('scroll', () => button?.classList.remove('visible'), { passive: true, capture: true });
})();
