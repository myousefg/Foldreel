import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowDownAZ, ArrowLeftRight, ArrowUp, ChevronLeft, ChevronRight, Clipboard, Copy, ExternalLink, FolderInput, FolderOpen,
  FolderPlus, FolderTree, Hash, Info, LayoutGrid, List, Loader2, PanelLeft, RefreshCw, Scissors, Search, Star, Tag, Trash2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageActions, PageSubtitle } from '@/components/PageHeader';
import { Segmented } from '@/components/kit';
import ContextMenu from '@/components/ContextMenu';
import MediaLightbox from '@/components/MediaLightbox';
import LibraryMoveDialog from '@/components/LibraryMoveDialog';
import { EntryCell, DetailsHeader, GroupHead } from '@/components/library/Cells';
import LibrarySidebar from '@/components/library/LibrarySidebar';
import DetailsPane from '@/components/library/DetailsPane';
import Duplicates from '@/components/library/Duplicates';
import { PermanentDeleteDialog, TagsDialog } from '@/components/library/Dialogs';
import { useI18n } from '@/context/I18nProvider';
import { useSettings } from '@/context/SettingsProvider';
import { libraryApi } from '@/lib/api';
import { isElectron } from '@/lib/electron';
import { handoff } from '@/lib/handoff';
import { useLibraryClipboard, libraryClipboard } from '@/lib/libraryClipboard';
import { DRAG_TYPE, isLibraryDrag, readDrag, setDragBadge } from '@/lib/libraryDnd';
import { useLibraryActions } from '@/lib/useLibraryActions';
import { useLibraryData, useLibraryVersion } from '@/lib/useLibraryData';
import { MODES, buildRows, cellGeometry, entriesInRect, rectOfEntry, stepEntry, visibleRows } from '@/lib/virtualGrid';
import { formatSize } from '@/lib/utils';

const VIEW_MODES = ['details', 'tiles', 'small', 'medium', 'large'];
const PAD = 4; // room around the grid, so the ring on a selected tile at the edge is not cut off

function usePref(key, fallback, allowed) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v && (!allowed || allowed.includes(v)) ? v : fallback;
    } catch { return fallback; }
  });
  const set = useCallback((v) => {
    setValue(v);
    try { localStorage.setItem(key, v); } catch { /* storage unavailable */ }
  }, [key]);
  return [value, set];
}

const flag = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v === '1'; } catch { return fallback; }
};

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export default function Library() {
  const { t, lang } = useI18n();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const folder = params.get('folder') || '';
  const place = params.get('place') || 'all';
  const tag = params.get('tag') || '';
  const flat = place !== 'all' || !!tag;
  const go = useCallback((next) => {
    const p = {};
    if (next.folder) p.folder = next.folder;
    if (next.place && next.place !== 'all') p.place = next.place;
    if (next.tag) p.tag = next.tag;
    setParams(p);
  }, [setParams]);

  // Coming back to the Library from another page lands where you left it, not at the top.
  const fromMemory = useRef(null); // the remembered place while it is being checked
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (restoredOnce.current) return;
    restoredOnce.current = true;
    if ([...params].length) return;
    try {
      const last = JSON.parse(localStorage.getItem('foldreel_library_last') || 'null');
      if (last && (last.folder || last.place || last.tag)) { fromMemory.current = last; setParams(last, { replace: true }); }
    } catch { /* nothing remembered */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try { localStorage.setItem('foldreel_library_last', JSON.stringify(Object.fromEntries([...params]))); } catch { /* ignore */ }
  }, [params]);

  // ── preferences ───────────────────────────────────────────────────────────
  const [mode, setMode] = usePref('foldreel_library_mode', 'medium', VIEW_MODES);
  const [scope, setScope] = usePref('foldreel_library_scope', 'folders', ['folders', 'all']);
  const [kind, setKind] = usePref('foldreel_library_kind', 'all', ['all', 'image', 'video']);
  const [sort, setSort] = usePref('foldreel_library_sort2', 'mtime', ['mtime', 'name', 'size', 'type', 'folder']);
  const [order, setOrder] = usePref('foldreel_library_order', 'desc', ['asc', 'desc']);
  const [group, setGroup] = usePref('foldreel_library_group2', 'none', ['none', 'date', 'folder', 'creator', 'series', 'site', 'type']);
  const [showSide, setShowSide] = useState(() => flag('foldreel_library_side', true));
  const [showDetails, setShowDetails] = useState(() => flag('foldreel_library_details', false));
  const toggleFlag = (key, setter) => setter((v) => { try { localStorage.setItem(key, v ? '0' : '1'); } catch { /* ignore */ } return !v; });

  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const searchRef = useRef(null);

  const query = useMemo(() => ({
    folder, view: flat ? 'all' : scope, place: place === 'duplicates' ? 'all' : place, tag, kind, sort, order,
    group: flat || scope === 'all' ? group : 'none', q: dq,
  }), [folder, flat, scope, place, tag, kind, sort, order, group, dq]);

  const data = useLibraryData(query, place !== 'duplicates');
  const meta = data.meta;
  // The remembered folder may have been moved or deleted since: fall back to the top.
  useEffect(() => {
    const want = fromMemory.current;
    if (!want) return;
    if (data.error) { fromMemory.current = null; setParams({}, { replace: true }); return; }
    if (!meta || meta.folder !== (want.folder || '')) return; // still the answer for some other place
    fromMemory.current = null;
    if (meta.folder_exists === false) setParams({}, { replace: true });
  }, [data.error, meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const folders = useMemo(() => (meta?.folders || []).map((f) => ({ ...f, type: 'folder' })), [meta]);
  const F = folders.length;
  const total = data.total;

  // ── the folder tree, tags and counts on the left ─────────────────────────────
  const [tree, setTree] = useState(null);
  const loadTree = useCallback(() => { libraryApi.tree().then(setTree).catch(() => {}); }, []);
  useEffect(() => { loadTree(); }, [loadTree]);
  const refresh = useCallback((hard = false, treeOnly = false) => {
    if (!treeOnly) data.reload(hard);
    loadTree();
  }, [data, loadTree]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const { scanning } = useLibraryVersion(useCallback(() => refreshRef.current(false), []));

  // ── selection ───────────────────────────────────────────────────────────────
  const [sel, setSel] = useState(() => new Set());
  // Select mode: a click picks or drops a file instead of replacing the selection. It starts with a
  // long press or a drag, and ends with Cancel or once an action on the selection has been done.
  const [selectMode, setSelectMode] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const anchor = useRef(-1);
  const [renaming, setRenaming] = useState(null);       // entry index being renamed
  const [dropOn, setDropOn] = useState(-1);
  const [menu, setMenu] = useState(null);
  const [light, setLight] = useState(null);             // { files, index }
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const clip = useLibraryClipboard();
  const cutSet = useMemo(() => new Set(clip.op === 'move' ? clip.paths : []), [clip]);

  // Everything below reads the latest state through this, so event handlers can stay stable.
  const S = useRef({});
  const allPaths = useRef({ key: '', paths: null, pending: null });

  const entryAt = useCallback((idx) => {
    if (idx < 0) return undefined;
    if (idx < F) return folders[idx];
    return data.getItem(idx - F);
  }, [F, folders, data]);

  const getAllPaths = useCallback(() => {
    const key = JSON.stringify(query) + (meta?.version ?? '');
    const c = allPaths.current;
    if (c.key === key && c.paths) return Promise.resolve(c.paths);
    if (c.key === key && c.pending) return c.pending;
    const pending = libraryApi.paths(query).then((paths) => {
      if (allPaths.current.key === key) allPaths.current = { key, paths, pending: null };
      return paths;
    });
    allPaths.current = { key, paths: null, pending };
    return pending;
  }, [query, meta]);

  const pathAt = useCallback((idx) => {
    if (idx < F) return folders[idx]?.path;
    return data.getItem(idx - F)?.path ?? allPaths.current.paths?.[idx - F];
  }, [F, folders, data]);

  const rangePaths = useCallback(async (a, b) => {
    const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
    const out = [];
    for (let i = lo; i <= Math.min(hi, F - 1); i += 1) out.push(folders[i].path);
    if (hi >= F) {
      const all = await getAllPaths();
      for (let i = Math.max(lo, F); i <= hi; i += 1) if (all[i - F]) out.push(all[i - F]);
    }
    return out;
  }, [F, folders, getAllPaths]);

  const clearSel = useCallback(() => { setSel(new Set()); anchor.current = -1; }, []);
  const exitSelect = useCallback(() => { setSelectMode(false); setSel(new Set()); anchor.current = -1; }, []);
  const finishSelect = () => { if (S.current.selectMode) exitSelect(); };
  useEffect(() => { clearSel(); setSelectMode(false); setCursor(-1); setRenaming(null); }, [query, clearSel]);

  const loadedByPath = useMemo(() => {
    const m = new Map();
    folders.forEach((f) => m.set(f.path, f));
    for (const items of data.pages.values()) for (const it of items) m.set(it.path, it);
    return m;
  }, [folders, data.pages]);

  // ── actions ───────────────────────────────────────────────────────────────────
  const onGone = useCallback(() => { setSel(new Set()); }, []);
  const actions = useLibraryActions({
    t, deleteMode: settings?.delete_mode || 'recycle', refresh, patchItem: data.patchItem, onGone,
  });

  const selPaths = () => [...S.current.sel];
  const selFiles = () => selPaths().filter((p) => !S.current.folderPaths.has(p));
  const nameOf = (p) => S.current.byPath(p)?.name || p.split(/[\\/]/).pop();

  const deleteSel = (forcePermanent = false) => {
    const paths = selPaths();
    actions.remove(paths, paths.map(nameOf), { forcePermanent, after: finishSelect });
  };

  const send = (target) => {
    const files = selFiles();
    if (!files.length) return;
    handoff.set(target, files);
    navigate(`/${target}`);
  };

  const pasteHere = (destRel) => {
    const c = libraryClipboard.get();
    if (!c.op || !c.paths.length) return;
    actions.paste(c.op === 'move' ? 'move' : 'copy', c.paths, destRel);
  };

  const startRename = () => {
    const idx = S.current.cursor >= 0 && S.current.sel.has(pathAt(S.current.cursor)) ? S.current.cursor : -1;
    const entry = idx >= 0 ? entryAt(idx) : null;
    if (entry && S.current.sel.size === 1) setRenaming(idx);
    else if (S.current.sel.size > 1) send('organize');
  };

  const newFolder = async () => {
    const parent = flat ? '' : folder;
    const r = await actions.mkdir(parent);
    if (r) S.current.pendingRename = r.path;
  };
  // After the new folder shows up in the listing, put its name into edit mode.
  useEffect(() => {
    const p = S.current.pendingRename;
    if (!p) return;
    const at = folders.findIndex((f) => f.path === p);
    if (at >= 0) { S.current.pendingRename = null; setSel(new Set([p])); setCursor(at); anchor.current = at; setRenaming(at); }
  }, [folders]);

  const openEntry = (idx) => {
    const e = entryAt(idx);
    if (!e) return;
    if (e.type === 'folder') { go({ folder: e.rel }); return; }
    const files = [];
    let at = 0;
    for (let i = 0; i < total; i += 1) {
      const it = data.getItem(i);
      if (!it) continue;
      if (it.path === e.path) at = files.length;
      files.push(it);
    }
    setLight({ files, index: at });
  };

  const copyPath = async (p) => {
    try { await navigator.clipboard.writeText(p); toast.success(t('library.pathCopied')); } catch { toast.error(t('library.actionFailed')); }
  };

  // ── layout ───────────────────────────────────────────────────────────────────
  const scroller = useRef(null);
  const [width, setWidth] = useState(900);
  const [viewH, setViewH] = useState(600);
  const [scrollTop, setScrollTop] = useState(0);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const measure = () => { setWidth(el.clientWidth - 2 * PAD); setViewH(el.clientHeight); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [place]);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; setScrollTop(0); }, [query]);

  const fmtMonth = useMemo(() => new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }), [lang]);
  const fmt = useMemo(() => {
    const f = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' });
    return (sec) => f.format(new Date(sec * 1000));
  }, [lang]);

  const groupLabel = useCallback((g) => {
    const k = g.key;
    if (query.group === 'date') { const [y, m] = k.split('-').map(Number); return fmtMonth.format(new Date(y, (m || 1) - 1, 1)); }
    if (query.group === 'folder') return k || t('library.rootName');
    if (query.group === 'type') return k === 'video' ? t('library.kind.video') : t('library.kind.image');
    return k || t('library.unknown');
  }, [query.group, fmtMonth, t]);

  const geo = useMemo(() => cellGeometry(mode, width), [mode, width]);
  const blocks = useMemo(() => {
    const b = [];
    if (F) b.push({ type: 'cells', count: F });
    const groups = meta?.groups || [];
    if (groups.length) {
      for (const g of groups) { b.push({ type: 'head', label: groupLabel(g), count: g.count, key: g.key }); b.push({ type: 'cells', count: g.count }); }
    } else if (total) b.push({ type: 'cells', count: total });
    return b;
  }, [F, total, meta, groupLabel]);
  const layout = useMemo(() => buildRows(blocks, geo), [blocks, geo]);
  const [first, last] = visibleRows(layout.rows, scrollTop, viewH);
  const entryCount = F + total;

  // Load the pages that scrolling reveals.
  useEffect(() => {
    let lo = Infinity;
    let hi = -1;
    for (let r = first; r <= last; r += 1) {
      const row = layout.rows[r];
      if (row?.type !== 'cells') continue;
      lo = Math.min(lo, row.first);
      hi = Math.max(hi, row.first + row.n - 1);
    }
    if (hi >= 0) data.ensureRange(Math.max(0, lo - F), Math.max(0, hi - F));
  }, [first, last, layout, F]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToEntry = useCallback((idx) => {
    const el = scroller.current;
    const r = rectOfEntry(layout.rows, geo, idx);
    if (!el || !r) return;
    const top = r.y + PAD;
    if (top - PAD < el.scrollTop) el.scrollTop = top - PAD;
    else if (top + r.h + PAD > el.scrollTop + el.clientHeight) el.scrollTop = top + r.h + PAD - el.clientHeight;
  }, [layout, geo]);

  // ── selection gestures ────────────────────────────────────────────────────────
  const selectOnly = (idx) => {
    const p = pathAt(idx);
    if (!p) return;
    setSel(new Set([p])); setCursor(idx); anchor.current = idx;
  };
  const toggleIdx = (idx) => {
    const p = pathAt(idx);
    if (!p) return;
    setSel((prev) => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; });
    setCursor(idx); anchor.current = idx;
  };
  const extendTo = async (idx, keep) => {
    const from = anchor.current >= 0 ? anchor.current : idx;
    const paths = await rangePaths(from, idx);
    setSel((prev) => new Set([...(keep ? prev : []), ...paths]));
    setCursor(idx);
  };

  const selectAll = async () => {
    const all = await getAllPaths();
    setSel(new Set([...folders.map((f) => f.path), ...all]));
  };

  // ── drag and drop ────────────────────────────────────────────────────────────
  const dropInto = (destRel, e) => {
    const paths = readDrag(e);
    if (!paths?.length) return;
    // a folder can not go into itself
    actions.paste(e.ctrlKey ? 'copy' : 'move', paths, destRel);
  };

  const onSidebarDrop = (target, e) => {
    const paths = readDrag(e);
    if (!paths?.length) return;
    if (target.type === 'folder') dropInto(target.rel, e);
    else if (target.type === 'favorites') actions.favorite(paths, true, paths);
    else if (target.type === 'tag') actions.tags(paths, [target.tag], [], paths);
  };

  // ── the stable handlers the cells call ──────────────────────────────────────
  const live = {
    click: (e, idx) => {
      scroller.current?.focus({ preventScroll: true });
      if (S.current.renaming != null) return;
      if (pressed.current) { pressed.current = false; return; } // the click that ends a long press
      if (S.current.selectMode) { if (e.shiftKey) extendTo(idx, true); else toggleIdx(idx); return; }
      if (e.shiftKey) extendTo(idx, e.ctrlKey || e.metaKey);
      else if (e.ctrlKey || e.metaKey) toggleIdx(idx);
      else selectOnly(idx);
    },
    toggle: (e, idx) => { if (e.shiftKey) extendTo(idx, true); else toggleIdx(idx); },
    open: (e, idx) => { e.preventDefault(); if (!S.current.selectMode) openEntry(idx); },
    menu: (e, idx) => {
      e.preventDefault(); e.stopPropagation();
      const p = pathAt(idx);
      if (p && !S.current.sel.has(p)) selectOnly(idx);
      setMenu({ x: e.clientX, y: e.clientY, kind: 'entry', idx });
    },
    star: (e, idx) => {
      const it = entryAt(idx);
      if (it) actions.favorite([it.path], !it.fav, [it.path]);
    },
    dragStart: (e, idx) => {
      const p = pathAt(idx);
      if (!p) { e.preventDefault(); return; }
      let paths = [...S.current.sel];
      if (!S.current.sel.has(p)) { paths = [p]; selectOnly(idx); }
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(paths));
      e.dataTransfer.setData('text/plain', paths.join('\n'));
      e.dataTransfer.effectAllowed = 'copyMove';
      setDragBadge(e, paths.length, nameOf(p));
    },
    dragOver: (e, idx) => {
      const en = entryAt(idx);
      if (en?.type !== 'folder' || !isLibraryDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
      setDropOn(idx);
    },
    dragLeave: (e, idx) => setDropOn((cur) => (cur === idx ? -1 : cur)),
    drop: (e, idx) => {
      const en = entryAt(idx);
      setDropOn(-1);
      if (en?.type !== 'folder' || !isLibraryDrag(e)) return;
      e.preventDefault();
      dropInto(en.rel, e);
    },
    renameCommit: async (idx, value) => {
      const en = entryAt(idx);
      setRenaming(null);
      if (en) await actions.rename(en, value);
      scroller.current?.focus({ preventScroll: true });
    },
    renameCancel: () => { setRenaming(null); scroller.current?.focus({ preventScroll: true }); },
  };
  S.current.live = live;
  // What the tiles hold never changes, so they are not redrawn when the page re-renders.
  const handlers = useMemo(() => Object.fromEntries(
    ['click', 'toggle', 'open', 'menu', 'star', 'dragStart', 'dragOver', 'dragLeave', 'drop', 'renameCommit', 'renameCancel']
      .map((k) => [k, (...a) => S.current.live[k](...a)]),
  ), []);

  // ── long press: starts select mode ──────────────────────────────────────────
  const pressed = useRef(false);
  const press = useRef(null);
  const cancelPress = () => { if (press.current) clearTimeout(press.current.timer); press.current = null; };
  const onPressStart = (e) => {
    pressed.current = false;
    cancelPress();
    const opt = e.button === 0 ? e.target.closest('[role="option"]') : null;
    if (!opt || e.target.closest('button,input')) return;
    const idx = Number(String(opt.id).replace('lib-e-', ''));
    if (!Number.isFinite(idx)) return;
    press.current = {
      x: e.clientX, y: e.clientY,
      timer: setTimeout(() => {
        press.current = null;
        const p = pathAt(idx);
        if (!p) return;
        pressed.current = true;
        setSelectMode(true);
        setSel((prev) => new Set(prev).add(p));
        setCursor(idx); anchor.current = idx;
      }, 450),
    };
  };
  const onPressMove = (e) => {
    const c = press.current;
    if (c && Math.hypot(e.clientX - c.x, e.clientY - c.y) > 8) cancelPress();
  };
  useEffect(() => cancelPress, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── rubber band ──────────────────────────────────────────────────────────────
  const [band, setBand] = useState(null);
  const bandRef = useRef(null);
  const onBackgroundDown = (e) => {
    if (e.button !== 0 || e.target.closest('[role="option"],button,input,a')) return;
    const el = scroller.current;
    const box = el.getBoundingClientRect();
    if (e.clientX > box.left + el.clientWidth) return; // the scrollbar
    const base = e.ctrlKey || e.metaKey || e.shiftKey || S.current.selectMode ? new Set(S.current.sel) : new Set();
    const start = { x: e.clientX - box.left - PAD, y: e.clientY - box.top + el.scrollTop - PAD };
    bandRef.current = { start, base, moved: false, lastX: e.clientX, lastY: e.clientY };
    getAllPaths().catch(() => {});
    el.focus({ preventScroll: true });
    const update = () => {
      const b = bandRef.current;
      if (!b) return;
      const cur = { x: b.lastX - box.left - PAD, y: b.lastY - box.top + el.scrollTop - PAD };
      if (!b.moved && Math.hypot(cur.x - start.x, cur.y - start.y) < 5) return;
      if (!b.moved) setSelectMode(true); // dragging a box over files is select mode too
      b.moved = true;
      setBand({ x1: start.x, y1: start.y, x2: cur.x, y2: cur.y });
      const idxs = entriesInRect(S.current.layout.rows, S.current.geo, { x1: start.x, y1: start.y, x2: cur.x, y2: cur.y });
      const next = new Set(base);
      for (const i of idxs) { const p = pathAt(i); if (p) next.add(p); }
      setSel(next);
    };
    const move = (ev) => {
      const b = bandRef.current;
      if (!b) return;
      b.lastX = ev.clientX; b.lastY = ev.clientY;
      // scroll when the pointer is near the top or bottom edge
      if (ev.clientY < box.top + 24) el.scrollTop -= 18;
      else if (ev.clientY > box.bottom - 24) el.scrollTop += 18;
      update();
    };
    const up = () => {
      const b = bandRef.current;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      bandRef.current = null;
      setBand(null);
      if (b && !b.moved && !e.ctrlKey && !e.metaKey && !e.shiftKey && !S.current.selectMode) clearSel();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── keyboard ─────────────────────────────────────────────────────────────────
  const onKeyDown = (e) => {
    if (S.current.renaming != null) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) {
      e.preventDefault();
      const next = stepEntry(S.current.cursor, k, geo, entryCount);
      if (next < 0) return;
      scrollToEntry(next);
      if (e.shiftKey) extendTo(next, false).then(() => {}); else if (!ctrl) selectOnly(next); else setCursor(next);
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      const next = k === 'Home' ? 0 : entryCount - 1;
      if (next < 0) return;
      scrollToEntry(next);
      if (e.shiftKey) extendTo(next, false); else selectOnly(next);
    } else if (k === 'Enter') { e.preventDefault(); if (S.current.cursor >= 0) openEntry(S.current.cursor); }
    else if (k === ' ') { e.preventDefault(); if (S.current.cursor >= 0) openEntry(S.current.cursor); }
    else if (k === 'F2') { e.preventDefault(); startRename(); }
    else if (k === 'Delete') { e.preventDefault(); if (S.current.sel.size) deleteSel(e.shiftKey); }
    else if (k === 'Escape') { if (S.current.selectMode) exitSelect(); else if (S.current.sel.size) clearSel(); else if (clip.op) libraryClipboard.clear(); }
    else if (k === 'Backspace' || (e.altKey && k === 'ArrowUp')) { e.preventDefault(); goUp(); }
    else if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
    else if (ctrl && k.toLowerCase() === 'c') { e.preventDefault(); if (S.current.sel.size) { libraryClipboard.set('copy', selPaths()); toast(t('library.copiedToClipboard', { count: S.current.sel.size })); finishSelect(); } }
    else if (ctrl && k.toLowerCase() === 'x') { e.preventDefault(); if (S.current.sel.size) { libraryClipboard.set('move', selPaths()); finishSelect(); } }
    else if (ctrl && k.toLowerCase() === 'v') { e.preventDefault(); pasteHere(flat ? '' : folder); }
    else if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); actions.undo(); }
    else if (ctrl && e.shiftKey && k.toLowerCase() === 'n') { e.preventDefault(); newFolder(); }
    else if (e.altKey && k === 'Enter') { e.preventDefault(); toggleFlag('foldreel_library_details', setShowDetails); }
    else if (k === 'F5') { e.preventDefault(); refresh(true); }
    else if (ctrl && k.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); }
  };

  const goUp = () => { if (!flat && folder) go({ folder: folder.split('/').slice(0, -1).join('/') }); };

  // ── what the menu shows ─────────────────────────────────────────────────────
  const deletes = settings?.delete_mode === 'permanent';
  const buildMenu = (m) => {
    if (m.kind === 'background') {
      return [
        { id: 'new-folder', label: t('library.newFolder'), icon: FolderPlus, shortcut: 'Ctrl+Shift+N', onSelect: newFolder },
        { id: 'paste', label: t('library.paste'), icon: Clipboard, shortcut: 'Ctrl+V', disabled: !clip.op, onSelect: () => pasteHere(flat ? '' : folder) },
        { separator: true },
        { id: 'select-all', label: t('library.selectAll'), shortcut: 'Ctrl+A', onSelect: selectAll },
        { id: 'refresh', label: t('library.refresh'), icon: RefreshCw, shortcut: 'F5', onSelect: () => refresh(true) },
        { separator: true },
        ...VIEW_MODES.map((v) => ({ id: `view-${v}`, label: t(`library.mode.${v}`), checked: mode === v, onSelect: () => setMode(v) })),
        { separator: true },
        { id: 'details', label: t('library.details'), icon: Info, shortcut: 'Alt+Enter', checked: showDetails, onSelect: () => toggleFlag('foldreel_library_details', setShowDetails) },
      ];
    }
    const paths = [...sel];
    const files = paths.filter((p) => !S.current.folderPaths.has(p));
    const single = paths.length === 1 ? S.current.byPath(paths[0]) : null;
    const allFav = files.length > 0 && files.every((p) => S.current.byPath(p)?.fav);
    const oneFolder = single?.type === 'folder' ? single : null;
    return [
      { id: 'open', label: t('library.open'), icon: ExternalLink, shortcut: 'Enter', hidden: paths.length !== 1, onSelect: () => openEntry(m.idx) },
      { id: 'open-app', label: t('library.openDefault'), hidden: !isElectron || !single || single.type !== 'file', onSelect: () => window.electronAPI.openPath(single.path) },
      { id: 'reveal', label: t('library.showInFolder'), icon: FolderOpen, hidden: !isElectron || !single || !window.electronAPI?.showInFolder, onSelect: () => window.electronAPI.showInFolder(single.path) },
      { separator: true },
      { id: 'cut', label: t('library.cut'), icon: Scissors, shortcut: 'Ctrl+X', onSelect: () => { libraryClipboard.set('move', paths); finishSelect(); } },
      { id: 'copy', label: t('library.copy'), icon: Copy, shortcut: 'Ctrl+C', onSelect: () => { libraryClipboard.set('copy', paths); finishSelect(); } },
      { id: 'paste', label: t('library.pasteInto'), icon: Clipboard, shortcut: 'Ctrl+V', hidden: !oneFolder, disabled: !clip.op, onSelect: () => pasteHere(oneFolder.rel) },
      { separator: true },
      { id: 'rename', label: paths.length > 1 ? t('library.renameMany') : t('library.rename'), icon: FolderTree, shortcut: 'F2', onSelect: startRename },
      { id: 'move', label: t('library.moveTo'), icon: FolderInput, onSelect: () => setMoveOpen(true) },
      { separator: true },
      { id: 'favorite', label: allFav ? t('library.unfavorite') : t('library.favorite'), icon: Star, hidden: !files.length, onSelect: () => { actions.favorite(files, !allFav, files); finishSelect(); } },
      { id: 'tags', label: t('library.tagsAction'), icon: Tag, hidden: !files.length, onSelect: () => setTagsOpen(true) },
      { separator: true },
      { id: 'convert', label: t('library.convert'), icon: ArrowLeftRight, hidden: !files.length, onSelect: () => send('convert') },
      { id: 'organize', label: t('library.organize'), icon: FolderTree, hidden: !files.length, onSelect: () => send('organize') },
      { id: 'edit', label: t('library.edit'), icon: Scissors, hidden: !(single && single.type === 'file'), onSelect: () => { handoff.set('edit', [single.path]); navigate('/edit'); } },
      { separator: true },
      { id: 'copy-path', label: t('library.copyPath'), hidden: !single, onSelect: () => copyPath(single.path) },
      { id: 'properties', label: t('library.properties'), icon: Info, hidden: !single, onSelect: () => { setShowDetails(true); try { localStorage.setItem('foldreel_library_details', '1'); } catch { /* ignore */ } } },
      { separator: true },
      { id: 'delete', label: deletes ? t('library.deletePermanently') : t('library.delete'), icon: Trash2, shortcut: 'Del', danger: true, onSelect: () => deleteSel(false) },
      { id: 'delete-forever', label: t('library.deletePermanently'), icon: Trash2, shortcut: 'Shift+Del', danger: true, hidden: deletes, onSelect: () => deleteSel(true) },
    ];
  };

  // Latest values for the stable handlers.
  const folderPaths = useMemo(() => new Set(folders.map((f) => f.path)), [folders]);
  S.current = {
    ...S.current, sel, cursor, renaming, layout, geo, folderPaths, selectMode, byPath: (p) => loadedByPath.get(p),
  };

  // ── the bits around the grid ─────────────────────────────────────────────────
  const selectedItems = useMemo(() => [...sel].map((p) => loadedByPath.get(p)).filter((e) => e && e.type === 'file'), [sel, loadedByPath]);
  const selectedBytes = useMemo(() => {
    let n = 0;
    for (const p of sel) { const e = loadedByPath.get(p); if (!e) return null; if (e.type === 'file') n += e.size; }
    return n;
  }, [sel, loadedByPath]);
  const singleEntry = sel.size === 1 ? loadedByPath.get([...sel][0]) : null;

  const crumbs = folder ? folder.split('/') : [];
  const crumbDrop = (rel) => ({
    onDragOver: (e) => { if (isLibraryDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; } },
    onDrop: (e) => { if (isLibraryDrag(e)) { e.preventDefault(); dropInto(rel, e); } },
  });

  const counts = meta?.counts || { image: 0, video: 0 };
  const narrowed = !!dq || kind !== 'all' || flat;
  const summary = meta
    ? t('library.summary', narrowed
      ? { count: meta.total, size: formatSize(meta.total_size) }
      : { count: meta.scope_count, size: formatSize(meta.scope_size) })
    : '';
  const placeTitle = place === 'favorites' ? t('library.place.favorites') : place === 'recent' ? t('library.place.recent') : place === 'duplicates' ? t('library.place.duplicates') : tag ? `#${tag}` : '';
  const canSortHeader = mode === 'details';
  const onSortHeader = (key) => {
    if (sort === key) setOrder(order === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setOrder(key === 'mtime' || key === 'size' ? 'desc' : 'asc'); }
  };
  const empty = !data.loading && meta && total === 0 && F === 0;

  const lightFiles = light?.files;

  return (
    <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 7.25rem)' }} data-testid="library-page">
      <PageSubtitle>{place === 'duplicates' ? '' : summary}</PageSubtitle>
      <PageActions>
        {isElectron && meta?.root && (
          <Button variant="outline" size="sm" className="h-8" onClick={() => window.electronAPI.openPath(meta.root)}>
            <FolderOpen className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('library.openFolder')}
          </Button>
        )}
      </PageActions>

      {/* path bar and view controls */}
      <div className="flex items-center gap-2 flex-wrap" role="toolbar" aria-label={t('library.toolbar')}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleFlag('foldreel_library_side', setShowSide)} title={t('library.sidebar')} aria-label={t('library.sidebar')} aria-pressed={showSide}>
          <PanelLeft className="w-4 h-4" aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)} title={t('library.back')} aria-label={t('library.back')}><ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goUp} disabled={flat || !folder} title={t('library.up')} aria-label={t('library.up')} data-testid="library-up"><ArrowUp className="w-4 h-4" aria-hidden="true" /></Button>
        <nav aria-label={t('library.path')} className="flex items-center gap-0.5 text-[13px] min-w-0 flex-1 basis-48 rounded-md border border-border bg-card px-2 h-8 overflow-hidden">
          {flat ? (
            <span className="font-medium flex items-center gap-1 truncate">{tag && <Hash className="w-3.5 h-3.5" aria-hidden="true" />}{placeTitle}</span>
          ) : (
            <>
              <button type="button" onClick={() => go({})} {...crumbDrop('')} className="shrink-0 px-1 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('library.rootName')}</button>
              {crumbs.map((c, i) => {
                const rel = crumbs.slice(0, i + 1).join('/');
                const lastCrumb = i === crumbs.length - 1;
                return (
                  <span key={rel} className="flex items-center gap-0.5 min-w-0">
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
                    <button type="button" onClick={() => go({ folder: rel })} {...crumbDrop(rel)} aria-current={lastCrumb ? 'page' : undefined}
                      className={`px-1 rounded truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${lastCrumb ? 'font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{c}</button>
                  </span>
                );
              })}
            </>
          )}
        </nav>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('library.search')} aria-label={t('library.search')} className="h-8 w-48 ps-8 text-xs" data-testid="library-search" />
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refresh(true)} title={`${t('library.refresh')} (F5)`} aria-label={t('library.refresh')}>
          <RefreshCw className={`w-4 h-4 ${data.loading || scanning ? 'animate-spin' : ''}`} aria-hidden="true" />
        </Button>
      </div>

      {place !== 'duplicates' && (
        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-8" onClick={newFolder} data-testid="library-new-folder"><FolderPlus className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.newFolder')}</Button>
          {!flat && (
            <Segmented label={t('library.viewLabel')} value={scope} onChange={setScope}
              options={[{ value: 'folders', label: t('library.view.folders') }, { value: 'all', label: t('library.view.all') }]} />
          )}
          <Segmented label={t('library.kindLabel')} value={kind} onChange={setKind}
            options={[
              { value: 'all', label: t('library.kind.all'), count: counts.image + counts.video },
              { value: 'image', label: t('library.kind.image'), count: counts.image },
              { value: 'video', label: t('library.kind.video'), count: counts.video },
            ]} />
          <div className="flex items-center gap-2 ms-auto flex-wrap">
            <Select value={sort} onValueChange={(v) => { setSort(v); setOrder(v === 'mtime' || v === 'size' ? 'desc' : 'asc'); }}>
              <SelectTrigger className="h-8 w-40 text-xs" aria-label={t('library.sort.label')}><SelectValue /></SelectTrigger>
              <SelectContent>{['mtime', 'name', 'size', 'type', 'folder'].map((s) => <SelectItem key={s} value={s}>{t(`library.sort.${s}`)}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')} aria-label={t(order === 'asc' ? 'library.ascending' : 'library.descending')} title={t(order === 'asc' ? 'library.ascending' : 'library.descending')}>
              <ArrowDownAZ className={`w-4 h-4 ${order === 'desc' ? '-scale-y-100' : ''}`} aria-hidden="true" />
            </Button>
            {(flat || scope === 'all') && (
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger className="h-8 w-40 text-xs" aria-label={t('library.group.label')} data-testid="library-group"><SelectValue /></SelectTrigger>
                <SelectContent>{['none', 'date', 'folder', 'creator', 'series', 'site', 'type'].map((g) => <SelectItem key={g} value={g}>{t(`library.group.${g}`)}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label={t('library.viewMode')} data-testid="library-mode">
                <div className="flex items-center gap-1.5">{mode === 'details' ? <List className="w-3.5 h-3.5" aria-hidden="true" /> : <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />}<SelectValue /></div>
              </SelectTrigger>
              <SelectContent>{VIEW_MODES.map((v) => <SelectItem key={v} value={v}>{t(`library.mode.${v}`)}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant={showDetails ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => toggleFlag('foldreel_library_details', setShowDetails)} title={`${t('library.details')} (Alt+Enter)`} aria-label={t('library.details')} aria-pressed={showDetails} data-testid="library-details-toggle">
              <Info className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-4">
        {showSide && (
          <div className="w-56 shrink-0 min-h-0">
            <LibrarySidebar tree={tree} place={place} folder={folder} tag={tag} onNavigate={go} onDropOn={onSidebarDrop} t={t} />
          </div>
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {place === 'duplicates' ? (
            <div className="flex-1 min-h-0 overflow-y-auto pe-1">
              <Duplicates
                version={tree?.version} t={t} fmt={fmt}
                onDelete={(paths, after) => actions.remove(paths, paths.map((p) => p.split(/[\\/]/).pop()), { after })}
                onOpen={(files, index) => setLight({ files, index })}
              />
            </div>
          ) : (
            <>
              {canSortHeader && !empty && <div className="px-1"><DetailsHeader sort={sort} order={order} onSort={onSortHeader} t={t} /></div>}
              <div
                ref={scroller} tabIndex={0} role="listbox" aria-multiselectable="true" aria-label={t('library.files')}
                aria-activedescendant={cursor >= 0 ? `lib-e-${cursor}` : undefined}
                onKeyDown={onKeyDown} onMouseDown={onBackgroundDown}
                onPointerDown={onPressStart} onPointerMove={onPressMove} onPointerUp={cancelPress} onPointerCancel={cancelPress}
                onDragStart={cancelPress}
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                onContextMenu={(e) => { if (e.target.closest('[role="option"]')) return; e.preventDefault(); clearSel(); setMenu({ x: e.clientX, y: e.clientY, kind: 'background' }); }}
                className="flex-1 min-h-0 overflow-y-auto relative outline-none focus-visible:ring-1 focus-visible:ring-ring/40 rounded-md p-1"
                data-testid="library-scroller"
              >
                <div className="relative" style={{ height: layout.height + 16 }} data-testid="library-canvas">
                  {layout.rows.slice(first, last + 1).map((r) => {
                    if (r.type === 'head') {
                      return <div key={`h${r.block}`} className="absolute inset-x-0" style={{ top: r.y, height: r.h }}><GroupHead label={r.label} count={r.count} /></div>;
                    }
                    const cells = [];
                    for (let c = 0; c < r.n; c += 1) {
                      const idx = r.first + c;
                      const en = entryAt(idx);
                      cells.push(
                        <EntryCell
                          key={idx} idx={idx} entry={en} mode={mode} geo={geo} t={t} fmt={fmt} handlers={handlers}
                          selected={!!en && sel.has(en.path)} selecting={selectMode || sel.size > 0} cursor={cursor === idx}
                          cut={!!en && cutSet.has(en.path)} renaming={renaming === idx} dropTarget={dropOn === idx}
                        />,
                      );
                    }
                    return (
                      <div key={`r${r.first}`} className="absolute inset-x-0 grid" style={{ top: r.y, height: r.h, gridTemplateColumns: `repeat(${geo.cols}, ${geo.cellW}px)`, columnGap: geo.gap }}>
                        {cells}
                      </div>
                    );
                  })}
                  {band && (
                    <div
                      className="absolute border border-primary bg-primary/15 rounded-sm pointer-events-none z-10"
                      style={{ left: Math.min(band.x1, band.x2), top: Math.min(band.y1, band.y2), width: Math.abs(band.x2 - band.x1), height: Math.abs(band.y2 - band.y1) }}
                      data-testid="library-band"
                    />
                  )}
                </div>
                {data.loading && !meta && <p className="py-16 text-center text-sm text-muted-foreground">{t('common.loading')}</p>}
                {data.error && <p className="py-16 text-center text-sm text-muted-foreground">{t('library.loadFailed')}</p>}
                {empty && <p className="py-16 text-center text-sm text-muted-foreground">{dq || kind !== 'all' || flat ? t('library.noMatch') : t('library.empty')}</p>}
              </div>
            </>
          )}

          {/* status bar */}
          <div className="shrink-0 flex items-center gap-3 h-8 text-xs text-muted-foreground border-t border-border mt-1 pt-1" role="status" data-testid="library-status">
            {place !== 'duplicates' && <span className="tabular-nums">{t('library.itemsCount', { count: F + total })}</span>}
            {sel.size > 0 && (
              <span className="tabular-nums" data-testid="library-selected-count">
                {t('library.selected', { count: sel.size })}{selectedBytes != null && selectedBytes > 0 ? ` · ${formatSize(selectedBytes)}` : ''}
              </span>
            )}
            {clip.op && <span className="flex items-center gap-1"><Clipboard className="w-3 h-3" aria-hidden="true" />{t(clip.op === 'move' ? 'library.clipCut' : 'library.clipCopied', { count: clip.paths.length })}</span>}
            <span className="ms-auto flex items-center gap-1">{(scanning || data.loading) && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}</span>
          </div>
        </div>

        {showDetails && place !== 'duplicates' && (
          <div className="w-72 shrink-0 min-h-0">
            <DetailsPane
              entry={singleEntry} count={sel.size} bytes={selectedBytes} t={t} fmt={fmt}
              folderLabel={folder || t('library.rootName')} summary={summary}
              onFavorite={() => singleEntry && actions.favorite([singleEntry.path], !singleEntry.fav, [singleEntry.path])}
              onTags={() => setTagsOpen(true)}
              onOpen={() => { if (singleEntry?.type === 'folder') go({ folder: singleEntry.rel }); else if (isElectron && singleEntry) window.electronAPI.openPath(singleEntry.path); else openEntry(S.current.cursor); }}
              onGoto={(rel) => go({ folder: rel })} onFilter={go}
              onClose={() => toggleFlag('foldreel_library_details', setShowDetails)}
            />
          </div>
        )}
      </div>

      {/* what you can do with the selection */}
      {(sel.size > 0 || selectMode) && place !== 'duplicates' && (
        <div className="fixed bottom-10 inset-x-0 z-40 flex justify-center ps-52 pointer-events-none">
          <div role="toolbar" aria-label={t('library.selectionBar')} data-testid="library-selection-bar"
            className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5 surface-elevated">
            {selectMode
              ? <Button size="sm" variant="secondary" className="h-8" onClick={exitSelect} data-testid="library-cancel-select"><X className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('common.cancel')}</Button>
              : <Button size="icon" variant="ghost" className="h-8 w-8" onClick={clearSel} title={t('library.clearSelection')} aria-label={t('library.clearSelection')}><X className="w-4 h-4" aria-hidden="true" /></Button>}
            <span className="text-[13px] font-medium tabular-nums px-1 min-w-[84px]" data-testid="library-select-label">{selectMode && sel.size === 0 ? t('library.selectMode') : t('library.selected', { count: sel.size })}</span>
            <span className="w-px h-5 bg-border mx-1" aria-hidden="true" />
            <Button size="sm" variant="ghost" className="h-8" disabled={!sel.size} onClick={() => setMoveOpen(true)} data-testid="library-move"><FolderInput className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.move')}</Button>
            <Button size="sm" variant="ghost" className="h-8" disabled={!selFiles().length} onClick={() => { const f = selFiles(); const all = f.length > 0 && f.every((p) => S.current.byPath(p)?.fav); actions.favorite(f, !all, f); finishSelect(); }}><Star className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.favorite')}</Button>
            <Button size="sm" variant="ghost" className="h-8" disabled={!selFiles().length} onClick={() => setTagsOpen(true)}><Tag className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.tagsAction')}</Button>
            <Button size="sm" variant="ghost" className="h-8" disabled={!selFiles().length} onClick={() => send('organize')} data-testid="library-rename"><FolderTree className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.organizeShort')}</Button>
            <Button size="sm" variant="ghost" className="h-8" disabled={!selFiles().length} onClick={() => send('convert')} data-testid="library-convert"><ArrowLeftRight className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.convert')}</Button>
            <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive" disabled={!sel.size} onClick={() => deleteSel(false)} data-testid="library-delete"><Trash2 className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.delete')}</Button>
          </div>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={buildMenu(menu)} onClose={() => setMenu(null)} label={t('library.menu')} />}
      {light && lightFiles?.length > 0 && <MediaLightbox files={lightFiles} index={light.index} onIndex={(i) => setLight((l) => ({ ...l, index: i }))} onClose={() => setLight(null)} />}
      <LibraryMoveDialog
        open={moveOpen} count={sel.size} current={flat ? '' : folder} onClose={() => setMoveOpen(false)}
        onMove={async (dest, newFolder_) => { setMoveOpen(false); await actions.paste('move', selPaths(), dest, newFolder_); exitSelect(); }}
      />
      <TagsDialog
        open={tagsOpen} onClose={() => { setTagsOpen(false); if (S.current.tagsChanged) { S.current.tagsChanged = false; finishSelect(); } }} items={selectedItems} count={selFiles().length}
        known={(tree?.tags || []).map((x) => x.tag)} t={t}
        onChange={(add, remove) => { const f = selFiles(); S.current.tagsChanged = true; actions.tags(f, add, remove, f); }}
      />
      <PermanentDeleteDialog
        open={!!actions.pendingDelete} names={actions.pendingDelete?.names || []} count={actions.pendingDelete?.paths.length || 0}
        onConfirm={actions.confirmDelete} onCancel={actions.cancelDelete} t={t}
      />
    </div>
  );
}
