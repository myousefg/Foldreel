// Small helpers for presenting a job: who it came from, when, and how to group it.

// "ytdl:https://..." / "r:https://..." are gallery-dl extractor prefixes, not part of the URL.
const stripPrefix = (raw) => String(raw || '').replace(/^[a-z-]+:(?=https?:)/i, '');

export function parseSource(rawUrl) {
  try {
    const u = new URL(stripPrefix(rawUrl));
    const host = u.hostname.replace(/^www\./, '');
    const labels = host.split('.');
    const name = labels.length > 1 ? labels[labels.length - 2] : host;
    const path = u.pathname
      .split('/')
      .filter(Boolean)
      .slice(0, 3)
      .map((p) => { try { return decodeURIComponent(p); } catch { return p; } })
      .join(' / ');
    return { host, name, path };
  } catch {
    return { host: String(rawUrl || ''), name: '?', path: '' };
  }
}

// A stable hue per site, so each source keeps the same colour everywhere.
export function hueFor(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function timeAgo(iso, locale) {
  if (!iso) return '';
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

// "Today", "Yesterday", then a short date: the grouping headers in the library.
export function dayLabel(iso, locale) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diff === 0 || diff === 1) {
    const word = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-diff, 'day');
    return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1);
  }
  return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: diff > 300 ? 'numeric' : undefined });
}

// "1 file" / "5 files". Singular is only handled for English; other languages keep the
// existing plural-form string rather than guessing at 45 sets of plural rules.
export function fileCount(n, t, lang) {
  return String(lang || '').startsWith('en') && n === 1 ? '1 file' : `${n} ${t('dashboard.files')}`;
}

export function folderTail(path, parts = 2) {
  const segs = String(path || '').split(/[\\/]+/).filter(Boolean);
  return segs.slice(-parts).join('\\') || String(path || '');
}
