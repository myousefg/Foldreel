import { memo, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Film, Folder, ImageOff, Star } from 'lucide-react';
import { thumbUrl } from '@/lib/api';
import { formatSize } from '@/lib/utils';

const FETCH = { small: 320, medium: 640, large: 640, tiles: 320, details: 320 };

export const DETAILS_COLUMNS = '32px minmax(180px, 1fr) 150px 70px 86px 140px 32px';

function Cover({ path, size, kind, contain = false }) {
  const [failed, setFailed] = useState(false);
  if (!path || failed) {
    const Icon = kind === 'video' ? Film : ImageOff;
    return <span className="w-full h-full flex items-center justify-center"><Icon className="w-5 h-5 text-muted-foreground" aria-hidden="true" /></span>;
  }
  return (
    <img
      src={thumbUrl(path, size)} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)}
      className={`w-full h-full ${contain ? 'object-contain' : 'object-cover'}`}
    />
  );
}

// The name turns into a text box. Only the part before the extension is selected, like a file manager.
function RenameInput({ entry, onCommit, onCancel, className = '' }) {
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = entry.type === 'file' ? entry.name.lastIndexOf('.') : -1;
    el.setSelectionRange(0, dot > 0 ? dot : entry.name.length);
  }, [entry]);
  const finish = (commit) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(ref.current.value); else onCancel();
  };
  return (
    <input
      ref={ref} defaultValue={entry.name} spellCheck={false} aria-label={entry.name}
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
      data-testid="library-rename-input"
      className={`w-full min-w-0 rounded border border-ring bg-background px-1 py-0.5 text-[13px] outline-none ${className}`}
    />
  );
}

function Checkbox({ checked, label, onToggle, visible }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={checked} aria-label={label} tabIndex={-1}
      onClick={(e) => { e.stopPropagation(); onToggle(e); }} onDoubleClick={(e) => e.stopPropagation()}
      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-opacity ${
        checked ? 'bg-primary border-primary text-primary-foreground opacity-100'
          : `bg-black/40 border-white/80 text-transparent ${visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
      }`}
    >
      <Check className="w-3 h-3" aria-hidden="true" />
    </button>
  );
}

function StarButton({ on, label, onClick, always }) {
  return (
    <button
      type="button" aria-label={label} aria-pressed={on} tabIndex={-1}
      onClick={(e) => { e.stopPropagation(); onClick(e); }} onDoubleClick={(e) => e.stopPropagation()}
      className={`rounded-full p-1 transition-opacity ${on ? 'text-amber-400 opacity-100' : `text-white/90 ${always ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}`}
    >
      <Star className="w-4 h-4 drop-shadow" fill={on ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}

function typeLabel(entry) {
  if (entry.type === 'folder') return null;
  return (entry.ext || '').replace('.', '').toUpperCase() || (entry.kind === 'video' ? 'VIDEO' : 'IMAGE');
}

/**
 * One file or folder, drawn for the current view. `idx` is its position among all entries;
 * the handlers are stable and look the entry up by that number.
 */
function EntryCellBase({
  idx, entry, mode, geo, selected, selecting, cursor, cut, renaming, dropTarget, fmt, t, handlers: h,
}) {
  const isFolder = entry?.type === 'folder';
  const name = entry?.name || '';
  const ring = selected ? 'ring-2 ring-primary' : 'ring-1 ring-border';
  const common = {
    id: `lib-e-${idx}`, role: 'option', 'aria-selected': selected, 'data-testid': isFolder ? `library-folder-${name}` : 'library-tile',
    'data-path': entry?.path, draggable: !!entry && !renaming,
    onClick: (e) => h.click(e, idx), onDoubleClick: (e) => h.open(e, idx),
    onContextMenu: (e) => h.menu(e, idx), onDragStart: (e) => h.dragStart(e, idx),
    onDragOver: (e) => h.dragOver(e, idx), onDragLeave: (e) => h.dragLeave(e, idx), onDrop: (e) => h.drop(e, idx),
  };

  if (!entry) {
    // not loaded yet
    if (mode === 'details') return <div className="h-full flex items-center px-3"><span className="h-3 w-40 rounded bg-muted animate-pulse" /></div>;
    return (
      <div className="h-full" aria-hidden="true">
        <div className="rounded-lg bg-muted animate-pulse" style={{ height: geo.thumbH || geo.cellH }} />
      </div>
    );
  }

  const nameNode = renaming
    ? <RenameInput entry={entry} onCommit={(v) => h.renameCommit(idx, v)} onCancel={h.renameCancel} />
    : <span className="block text-[13px] font-medium truncate" title={name}>{name}</span>;
  const meta = isFolder
    ? t('library.folderMeta', { count: entry.count, size: formatSize(entry.size) })
    : formatSize(entry.size);

  const tags = entry.tags || [];

  // ── details: one line per file ─────────────────────────────────────────────
  if (mode === 'details') {
    return (
      <div
        {...common}
        className={`group h-full grid items-center gap-x-3 px-2 text-[13px] border-b border-border/60 cursor-default select-none ${
          selected ? 'bg-primary/10' : 'hover:bg-accent/50'} ${cursor ? 'outline outline-1 -outline-offset-1 outline-ring' : ''} ${cut ? 'opacity-50' : ''} ${dropTarget ? 'bg-primary/20' : ''}`}
        style={{ gridTemplateColumns: DETAILS_COLUMNS }}
      >
        <span className="flex items-center justify-center">
          {selected || selecting
            ? <Checkbox checked={selected} visible label={t('library.select', { name })} onToggle={(e) => h.toggle(e, idx)} />
            : <span className="w-6 h-6 rounded overflow-hidden bg-muted flex items-center justify-center">
              {isFolder
                ? (entry.cover ? <Cover path={entry.cover} size={FETCH.details} /> : <Folder className="w-4 h-4 text-muted-foreground" aria-hidden="true" />)
                : <Cover path={entry.path} size={FETCH.details} kind={entry.kind} />}
            </span>}
        </span>
        <span className="min-w-0 flex items-center gap-2">
          {isFolder && <Folder className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="min-w-0 flex-1">{nameNode}</span>
          {tags.length > 0 && <span className="shrink-0 text-[11px] text-muted-foreground truncate max-w-[140px]">{tags.join(', ')}</span>}
        </span>
        <span className="truncate text-muted-foreground" title={entry.folder}>{isFolder ? '' : (entry.folder || t('library.rootName'))}</span>
        <span className="text-muted-foreground">{isFolder ? t('library.folderType') : typeLabel(entry)}</span>
        <span className="text-muted-foreground tabular-nums text-end">{isFolder ? '' : meta}</span>
        <span className="text-muted-foreground tabular-nums truncate">{isFolder ? '' : fmt(entry.mtime)}</span>
        <span className="flex justify-center">
          {!isFolder && <StarButton on={entry.fav} always={entry.fav} label={t(entry.fav ? 'library.unfavorite' : 'library.favorite')} onClick={(e) => h.star(e, idx)} />}
        </span>
      </div>
    );
  }

  // ── tiles: thumbnail with three lines beside it ────────────────────────────
  if (mode === 'tiles') {
    return (
      <div
        {...common}
        className={`group h-full flex items-center gap-3 rounded-lg px-2 cursor-default select-none ${ring} ring-inset ${
          selected ? 'bg-primary/10' : 'hover:bg-accent/50'} ${cursor ? 'outline outline-1 outline-ring' : ''} ${cut ? 'opacity-50' : ''} ${dropTarget ? 'bg-primary/20 ring-2 ring-primary' : ''}`}
      >
        <span className="relative shrink-0 rounded-md overflow-hidden bg-muted" style={{ width: geo.thumbH, height: geo.thumbH }}>
          {isFolder
            ? (entry.cover ? <Cover path={entry.cover} size={FETCH.tiles} /> : <span className="w-full h-full flex items-center justify-center"><Folder className="w-6 h-6 text-muted-foreground" aria-hidden="true" /></span>)
            : <Cover path={entry.path} size={FETCH.tiles} kind={entry.kind} />}
          {isFolder && <Folder className="absolute start-1 bottom-1 w-4 h-4 text-white drop-shadow" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          {nameNode}
          <span className="block text-xs text-muted-foreground truncate">{isFolder ? meta : `${typeLabel(entry)} · ${meta}`}</span>
          <span className="block text-xs text-muted-foreground truncate">{isFolder ? '' : `${fmt(entry.mtime)}${entry.folder ? ` · ${entry.folder}` : ''}`}</span>
        </span>
        {!isFolder && entry.fav && <Star className="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" aria-label={t('library.favorite')} />}
      </div>
    );
  }

  // ── icons ─────────────────────────────────────────────────────────────────
  const showCaptionMeta = mode !== 'small';
  return (
    <div
      {...common}
      className={`group h-full cursor-default select-none ${cut ? 'opacity-50' : ''} ${dropTarget ? 'scale-[1.02]' : ''} transition-transform`}
    >
      <div
        className={`relative rounded-lg overflow-hidden bg-muted ring-inset ${ring} ${dropTarget ? 'ring-2 ring-primary' : ''} ${cursor ? 'outline outline-2 outline-offset-2 outline-ring' : ''}`}
        style={{ height: geo.thumbH }}
      >
        {isFolder
          ? (entry.cover
            ? <Cover path={entry.cover} size={FETCH[mode]} />
            : <span className="w-full h-full flex items-center justify-center"><Folder className="w-8 h-8 text-muted-foreground" aria-hidden="true" /></span>)
          : <Cover path={entry.path} size={FETCH[mode]} kind={entry.kind} contain={mode === 'large'} />}
        {isFolder && (
          <>
            <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" aria-hidden="true" />
            <Folder className="absolute start-2.5 bottom-2.5 w-4 h-4 text-white" aria-hidden="true" />
          </>
        )}
        {selected && <span className="absolute inset-0 bg-primary/20" aria-hidden="true" />}
        {!isFolder && entry.kind === 'video' && (
          <span className="absolute end-1.5 bottom-1.5 rounded bg-black/60 text-white p-1" aria-hidden="true"><Film className="w-3 h-3" /></span>
        )}
        <span className="absolute start-1.5 top-1.5">
          <Checkbox checked={selected} visible={selecting} label={t('library.select', { name })} onToggle={(e) => h.toggle(e, idx)} />
        </span>
        {!isFolder && (
          <span className="absolute end-1 top-1">
            <StarButton on={entry.fav} always={entry.fav} label={t(entry.fav ? 'library.unfavorite' : 'library.favorite')} onClick={(e) => h.star(e, idx)} />
          </span>
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        {nameNode}
        {showCaptionMeta && <span className="block text-xs text-muted-foreground truncate">{meta}</span>}
      </div>
    </div>
  );
}

export const EntryCell = memo(EntryCellBase);

export function GroupHead({ label, count }) {
  return (
    <h2 className="h-full flex items-end pb-1.5 text-[13px] font-semibold px-0.5">
      <span className="truncate">{label}</span>
      <span className="ms-2 font-normal text-muted-foreground tabular-nums">{count}</span>
    </h2>
  );
}

/** Column titles for the details view; click one to sort by it. */
export function DetailsHeader({ sort, order, onSort, t }) {
  const col = (key, label, align = '') => (
    <button
      type="button" onClick={() => onSort(key)} aria-sort={sort === key ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`flex items-center gap-1 h-full text-xs font-medium text-muted-foreground hover:text-foreground ${align}`}
    >
      <span className="truncate">{label}</span>
      {sort === key && (order === 'asc' ? <ArrowUp className="w-3 h-3" aria-hidden="true" /> : <ArrowDown className="w-3 h-3" aria-hidden="true" />)}
    </button>
  );
  return (
    <div className="grid items-center gap-x-3 px-2 h-8 border-b border-border bg-card/60" style={{ gridTemplateColumns: DETAILS_COLUMNS }} role="row">
      <span />
      {col('name', t('library.col.name'))}
      {col('folder', t('library.col.folder'))}
      {col('type', t('library.col.type'))}
      {col('size', t('library.col.size'), 'justify-end')}
      {col('mtime', t('library.col.modified'))}
      <span />
    </div>
  );
}
