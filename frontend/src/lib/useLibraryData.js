import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { libraryApi } from '@/lib/api';

export const PAGE = 200;

// Items keep one object identity for as long as they are loaded, so tiles can skip redrawing.
const tagFiles = (items) => items.map((it) => ({ ...it, type: 'file' }));

/**
 * One listing of the library, loaded a page at a time as it is scrolled.
 * `query` is the plain object sent to GET /library. Items are looked up by their
 * position in the whole listing (`getItem(i)`), so the page can draw row 5,000
 * without having loaded rows 0 to 4,999.
 */
export function useLibraryData(query, enabled = true) {
  const key = useMemo(() => JSON.stringify(query), [query]);
  const [meta, setMeta] = useState(null);
  const [pages, setPages] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState(false);
  const gen = useRef(0);
  const inflight = useRef(new Set());
  const force = useRef(false);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    if (!enabled) return undefined;
    const mine = ++gen.current;
    inflight.current = new Set();
    setLoading(true);
    const refresh = force.current ? true : undefined;
    force.current = false;
    libraryApi.list({ ...queryRef.current, offset: 0, limit: PAGE, refresh })
      .then((r) => {
        if (gen.current !== mine) return;
        const { items, ...rest } = r;
        setMeta(rest);
        setPages(new Map([[0, tagFiles(items)]]));
        setError(false);
      })
      .catch(() => { if (gen.current === mine) { setError(true); setMeta(null); setPages(new Map()); } })
      .finally(() => { if (gen.current === mine) setLoading(false); });
    return () => { gen.current += 1; };
  }, [key, tick, enabled]);

  const ensureRange = useCallback((from, to) => {
    if (to < from) return;
    const mine = gen.current;
    for (let p = Math.floor(from / PAGE); p <= Math.floor(to / PAGE); p += 1) {
      if (pagesRef.current.has(p) || inflight.current.has(p)) continue;
      inflight.current.add(p);
      libraryApi.list({ ...queryRef.current, offset: p * PAGE, limit: PAGE })
        .then((r) => {
          if (gen.current !== mine) return;
          setPages((prev) => { const next = new Map(prev); next.set(p, tagFiles(r.items)); return next; });
        })
        .catch(() => {})
        .finally(() => inflight.current.delete(p));
    }
  }, []);

  const getItem = useCallback((i) => pages.get(Math.floor(i / PAGE))?.[i % PAGE], [pages]);

  /** Reload from the start; `hard` also makes the server rescan the disk first. */
  const reload = useCallback((hard = false) => {
    if (hard) force.current = true;
    setTick((n) => n + 1);
  }, []);

  /** Change one loaded item in place (a star, a tag, a new name) without a round trip. */
  const patchItem = useCallback((path, patch) => {
    setPages((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [p, items] of prev) {
        const at = items.findIndex((it) => it.path === path);
        if (at >= 0) {
          const copy = items.slice();
          copy[at] = { ...copy[at], ...(typeof patch === 'function' ? patch(copy[at]) : patch) };
          next.set(p, copy);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  return { meta, loading, error, getItem, pages, ensureRange, reload, patchItem, total: meta?.total ?? 0 };
}

/**
 * Tells the page when the library changed behind its back (a download finished, a file
 * was moved in Explorer). The server rescans in the background while this polls.
 */
export function useLibraryVersion(onChange, intervalMs = 4000) {
  const last = useRef(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer = null;
    const poll = async () => {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const s = await libraryApi.status();
          if (stopped) return;
          setScanning(!!s.scanning);
          if (last.current !== null && s.version !== last.current) cb.current(s.version);
          last.current = s.version;
        } catch { /* the backend is busy or restarting; try again */ }
      }
      timer = setTimeout(poll, intervalMs);
    };
    poll();
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); poll(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [intervalMs]);
  return { scanning, markSeen: (v) => { last.current = v; } };
}
