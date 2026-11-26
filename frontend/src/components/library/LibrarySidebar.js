import { useMemo, useState } from 'react';
import { ChevronRight, Clock, Copy, Folder, FolderOpen, Hash, Images, Star } from 'lucide-react';
import { isLibraryDrag } from '@/lib/libraryDnd';

function buildTree(dirs) {
  const root = { rel: '', name: '', count: 0, kids: new Map() };
  for (const d of dirs) {
    let node = root;
    const parts = d.rel.split('/');
    parts.forEach((part, i) => {
      const rel = parts.slice(0, i + 1).join('/');
      if (!node.kids.has(part)) node.kids.set(part, { rel, name: part, count: 0, kids: new Map() });
      node = node.kids.get(part);
    });
    node.own = d.count;
  }
  const total = (n) => {
    let sum = n.own || 0;
    for (const k of n.kids.values()) sum += total(k);
    n.count = sum;
    return sum;
  };
  total(root);
  return root;
}

function usePersistedSet(key) {
  const [set, setSet] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
  });
  const toggle = (rel, force) => setSet((prev) => {
    const next = new Set(prev);
    const on = force ?? !next.has(rel);
    if (on) next.add(rel); else next.delete(rel);
    try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* storage unavailable */ }
    return next;
  });
  return [set, toggle];
}

function Item({ icon: Icon, label, count, active, onClick, over, dropProps, depth = 0, caret, testid, title }) {
  return (
    <div className="flex items-center" style={{ paddingInlineStart: depth * 14 }}>
      {caret || <span className="w-5 shrink-0" />}
      <button
        type="button" onClick={onClick} aria-current={active ? 'true' : undefined} data-testid={testid} title={title || label}
        {...dropProps}
        className={`flex-1 min-w-0 flex items-center gap-2 h-8 rounded-md px-2 text-[13px] text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          over ? 'bg-primary/20 ring-1 ring-primary' : active ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
      >
        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="truncate flex-1">{label}</span>
        {count != null && <span className="text-[11px] tabular-nums opacity-70">{count}</span>}
      </button>
    </div>
  );
}

export default function LibrarySidebar({ tree, place, folder, tag, onNavigate, onDropOn, t }) {
  const [open, toggleOpen] = usePersistedSet('foldreel_library_open');
  const [over, setOver] = useState(null);
  const root = useMemo(() => buildTree(tree?.dirs || []), [tree]);

  const drop = (target, key) => ({
    onDragOver: (e) => { if (isLibraryDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; setOver(key); } },
    onDragLeave: () => setOver((cur) => (cur === key ? null : cur)),
    onDrop: (e) => { if (isLibraryDrag(e)) { e.preventDefault(); setOver(null); onDropOn(target, e); } },
  });

  const atFolders = place === 'all' && !tag;
  const renderNode = (node, depth) => {
    const kids = [...node.kids.values()];
    const expanded = open.has(node.rel);
    const caret = kids.length ? (
      <button
        type="button" onClick={() => toggleOpen(node.rel)} aria-label={`${expanded ? t('library.collapse') : t('library.expand')} ${node.name}`} aria-expanded={expanded}
        className="w-5 h-8 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={`w-3.5 h-3.5 transition-transform rtl:rotate-180 ${expanded ? 'rotate-90 rtl:rotate-90' : ''}`} aria-hidden="true" />
      </button>
    ) : null;
    return (
      <div key={node.rel}>
        <Item
          icon={expanded && atFolders && folder === node.rel ? FolderOpen : Folder} label={node.name} count={node.count} depth={depth}
          active={atFolders && folder === node.rel} caret={caret} testid={`library-tree-${node.rel}`} title={node.rel}
          onClick={() => onNavigate({ folder: node.rel })} over={over === `f:${node.rel}`} dropProps={drop({ type: 'folder', rel: node.rel }, `f:${node.rel}`)}
        />
        {expanded && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  const heading = (text) => <h3 className="px-2 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{text}</h3>;

  return (
    <nav aria-label={t('library.sidebar')} className="h-full overflow-y-auto pe-1 pb-4" data-testid="library-sidebar">
      {heading(t('library.places'))}
      <Item icon={Images} label={t('library.rootName')} count={tree?.total} active={place === 'all' && !tag && !folder} onClick={() => onNavigate({})} testid="library-place-all"
        over={over === 'f:'} dropProps={drop({ type: 'folder', rel: '' }, 'f:')} />
      <Item icon={Star} label={t('library.place.favorites')} count={tree?.favorites} active={place === 'favorites'} onClick={() => onNavigate({ place: 'favorites' })} testid="library-place-favorites"
        over={over === 'fav'} dropProps={drop({ type: 'favorites' }, 'fav')} />
      <Item icon={Clock} label={t('library.place.recent')} count={tree?.recent} active={place === 'recent'} onClick={() => onNavigate({ place: 'recent' })} testid="library-place-recent" />
      <Item icon={Copy} label={t('library.place.duplicates')} active={place === 'duplicates'} onClick={() => onNavigate({ place: 'duplicates' })} testid="library-place-duplicates" />

      {heading(t('library.folders'))}
      {[...root.kids.values()].map((k) => renderNode(k, 0))}
      {root.kids.size === 0 && <p className="px-2 text-xs text-muted-foreground">{t('library.noSubfolders')}</p>}

      {(tree?.tags?.length > 0) && (
        <>
          {heading(t('library.tags'))}
          {tree.tags.map((tg) => (
            <Item
              key={tg.tag} icon={Hash} label={tg.tag} count={tg.count} active={tag.toLowerCase() === tg.tag.toLowerCase()}
              onClick={() => onNavigate({ tag: tg.tag })} testid={`library-tag-${tg.tag}`}
              over={over === `t:${tg.tag}`} dropProps={drop({ type: 'tag', tag: tg.tag }, `t:${tg.tag}`)}
            />
          ))}
        </>
      )}
    </nav>
  );
}
