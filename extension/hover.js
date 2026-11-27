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

  // Preferences (see prefs.js; content scripts can't load it, so the two keys
  // are read directly). Changes made in the popup or options page apply to
  // already-open tabs immediately via storage.onChanged.
  const pageHost = location.hostname.toLowerCase().replace(/^www\./, '');
  let enabled = true;
  let hiddenHosts = [];
  // "example.com" in the list also covers m.example.com and every other subdomain.
  const isHidden = () => hiddenHosts.some((h) => pageHost === h || pageHost.endsWith(`.${h}`));
  const isActive = () => enabled && !isHidden();

  function hideNow() {
    clearTimeout(hideTimer);
    button?.classList.remove('visible');
    currentEl = null;
  }

  chrome.storage.local.get({ hoverEnabled: true, hoverHiddenHosts: [] }).then((v) => {
    enabled = v.hoverEnabled !== false;
    hiddenHosts = v.hoverHiddenHosts || [];
    if (!isActive()) hideNow();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.hoverEnabled) enabled = changes.hoverEnabled.newValue !== false;
    if (changes.hoverHiddenHosts) hiddenHosts = changes.hoverHiddenHosts.newValue || [];
    if (!isActive()) hideNow();
  });

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
        background: #ff7152; color: #1c0f0b;
        font: 600 12px/1 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
        border: none; border-radius: 7px;
        padding: 6px 10px;
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

  // The direct address of the hovered file, when the page gives one.
  function mediaUrlFor(el) {
    if (el.tagName === 'IMG') {
      const src = el.currentSrc || el.src || '';
      return /^https?:/i.test(src) ? src : '';
    }
    if (el.tagName === 'VIDEO') {
      const src = el.currentSrc || el.querySelector('source[src]')?.src || el.src || '';
      return /^https?:/i.test(src) ? src : '';
    }
    return '';
  }

  // The address of the post a piece of media belongs to, for the sites Foldreel knows. Returns '' for
  // anything that is not the page of one post (a profile, a feed, a search).
  function postLink(href) {
    let u;
    try { u = new URL(href, location.href); } catch { return ''; }
    if (!/^https?:$/.test(u.protocol)) return '';
    const h = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
    const p = u.pathname;
    let m;
    if (/^(x|twitter)\.com$/.test(h)) return (m = p.match(/^\/[^/]+\/status\/\d+/)) ? u.origin + m[0] : '';
    if (h === 'instagram.com') return (m = p.match(/^(?:\/[^/]+)?\/(?:p|reel|tv)\/[\w-]+/)) ? u.origin + m[0] : '';
    if (h === 'tiktok.com') return (m = p.match(/^\/@[^/]+\/(?:video|photo)\/\d+/)) ? u.origin + m[0] : '';
    if (h === 'youtube.com' || h === 'music.youtube.com') {
      if (p === '/watch' && u.searchParams.get('v')) return `${u.origin}/watch?v=${u.searchParams.get('v')}`;
      return (m = p.match(/^\/(?:shorts|live)\/[\w-]+/)) ? u.origin + m[0] : '';
    }
    if (h === 'youtu.be') return (m = p.match(/^\/[\w-]{6,}/)) ? u.origin + m[0] : '';
    if (h === 'reddit.com') return (m = p.match(/^\/(?:r|user)\/[^/]+\/comments\/\w+/)) ? u.origin + m[0] : '';
    if (h === 'pinterest.com') return (m = p.match(/^\/pin\/\d+/)) ? u.origin + m[0] : '';
    if (h === 'bsky.app') return (m = p.match(/^\/profile\/[^/]+\/post\/\w+/)) ? u.origin + m[0] : '';
    if (h === 'threads.net' || h === 'threads.com') return (m = p.match(/^\/@[^/]+\/post\/[\w-]+/)) ? u.origin + m[0] : '';
    if (h === 'facebook.com') {
      if (p === '/watch' && u.searchParams.get('v')) return `${u.origin}/watch?v=${u.searchParams.get('v')}`;
      return (m = p.match(/^(?:\/[^/]+)?\/(?:reel|videos)\/\d+/)) ? u.origin + m[0] : '';
    }
    if (h === 'vimeo.com') return (m = p.match(/^\/\d+/)) ? u.origin + m[0] : '';
    return '';
  }

  const MEDIA_FILE = /\.(?:jpe?g|png|gif|webp|avif|bmp|mp4|webm|mov|m4v|mkv)(?:[?#]|$)/i;
  const VIDEO_POST = /\/(?:video|reel|tv|shorts|live|watch|videos)\b|[?&]v=/i;

  // The post the hovered media belongs to: its own link, or the nearest card around it that holds one or
  // two post links (a feed holds many, so a wide container is no answer).
  function nearbyPost(el) {
    const own = el.closest('a[href]');
    if (own) {
      const post = postLink(own.href);
      if (post) return { posts: [post] };
      if (/^https?:/i.test(own.href) && MEDIA_FILE.test(own.href)) return { file: own.href };
    }
    let node = el.parentElement;
    for (let i = 0; node && i < 8; i += 1, node = node.parentElement) {
      const found = [];
      for (const a of node.querySelectorAll('a[href]')) {
        const post = postLink(a.href);
        if (post && !found.includes(post)) found.push(post);
        if (found.length > 2) return {};
      }
      if (found.length) return { posts: found };
    }
    return {};
  }

  // What the button sends, in order of how well Foldreel can use it:
  //   a video: the post it belongs to, else the video file itself, else the page
  //   a photo: the photo file itself (a post can hold many, and this one was picked), unless it is the
  //            cover of a video post, which sends the post; else the post, else the page
  // The page counts as the post when the page is one (a watch page, a status page).
  function resolveTarget(el) {
    const isVideo = el.tagName === 'VIDEO';
    const pagePost = postLink(location.href);
    const { posts = [], file = '' } = nearbyPost(el);
    let post = '';
    if (pagePost && (!posts.length || posts.includes(pagePost))) post = pagePost;
    else if (posts.length) post = posts[0];
    let direct = mediaUrlFor(el) || file;
    if (direct) {
      try {
        const u = new URL(direct);
        // X serves a small copy by default; the same address with name=orig is the original.
        if (u.hostname === 'pbs.twimg.com' && u.pathname.startsWith('/media/')) { u.searchParams.set('name', 'orig'); direct = u.href; }
      } catch { /* keep the address as it is */ }
    }
    const coverOfVideo = !isVideo && post && VIDEO_POST.test(post);
    if (post && (isVideo || coverOfVideo || !direct)) return { url: post, kind: 'post' };
    if (direct) return { url: direct, kind: 'file', referer: location.href };
    return { url: location.href, kind: 'page' };
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
      // A video always gets the button (a player streaming through a blob: has no address of its own, and
      // then the post or the page is what gets sent); a picture needs a real address to send.
      if (el.tagName === 'IMG' && !mediaUrlFor(el)) continue;
      return { el, rect };
    }
    return null;
  }

  function showFor(el, rect) {
    ensureHost();
    currentEl = el;
    button.classList.remove('sent', 'failed');
    button.querySelector('span').textContent = 'Foldreel';
    const target = resolveTarget(el);
    const what = target.kind === 'post' ? 'this post' : target.kind === 'page' ? 'this page' : el.tagName === 'VIDEO' ? 'this video' : 'this picture';
    button.title = `Send ${what}
${target.url}`;
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

  const REASONS = { 'not-paired': 'Not connected', offline: 'Foldreel is closed', unauthorized: 'Reconnect' };

  async function onSend(e) {
    e.preventDefault();
    e.stopPropagation();
    // Only a real click. A page can call .click() on this button from its own script,
    // which would otherwise send a download to Foldreel without anyone asking.
    if (!e.isTrusted || !currentEl) return;
    const target = resolveTarget(currentEl);
    let result;
    try {
      result = await chrome.runtime.sendMessage({
        type: 'send',
        urls: [target.url],
        options: target.referer ? { referer: target.referer } : undefined,
      });
    } catch {
      result = { ok: false };
    }
    button.classList.toggle('sent', !!result?.ok);
    button.classList.toggle('failed', !result?.ok);
    button.querySelector('span').textContent = result?.ok ? 'Sent' : (REASONS[result?.reason] || 'Failed');
    setTimeout(scheduleHide, 1200);
  }

  // Throttled to ~12/s - elementsFromPoint is real DOM work, and mousemove
  // fires far more often than that needs to feel instant.
  let moveThrottle = null;
  document.addEventListener('mousemove', (e) => {
    if (!isActive() || moveThrottle) return;
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
