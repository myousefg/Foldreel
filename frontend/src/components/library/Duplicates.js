import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { libraryApi, thumbUrl } from '@/lib/api';
import { formatSize } from '@/lib/utils';

/**
 * Sets of identical files. Tick the copies you do not want and delete them;
 * "Keep one of each" ticks everything except the oldest in every set.
 */
export default function Duplicates({ version, onDelete, onOpen, t, fmt }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [sel, setSel] = useState(() => new Set());

  const load = useCallback(() => {
    setData(null); setError(false); setSel(new Set());
    libraryApi.duplicates().then(setData).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load, version]);

  const groups = data?.groups || [];
  const toggle = (p) => setSel((prev) => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const keepOne = () => {
    const next = new Set();
    for (const g of groups) g.files.slice(1).forEach((f) => next.add(f.path)); // files arrive oldest first
    setSel(next);
  };
  const freed = useMemo(() => groups.reduce((sum, g) => sum + g.size * g.files.filter((f) => sel.has(f.path)).length, 0), [groups, sel]);

  if (error) return <p className="py-16 text-center text-sm text-muted-foreground">{t('library.dupFailed')}</p>;
  if (!data) {
    return (
      <p className="py-16 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{t('library.dupLooking')}
      </p>
    );
  }
  if (!groups.length) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Check className="w-6 h-6 mx-auto mb-2" aria-hidden="true" />{t('library.dupNone')}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="library-duplicates">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-[13px]">{t('library.dupSummary', { count: data.group_count, size: formatSize(data.wasted) })}</p>
        <Button size="sm" variant="outline" onClick={keepOne} data-testid="library-dup-keep-one"><Copy className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.dupKeepOne')}</Button>
        <Button
          size="sm" variant="destructive" disabled={sel.size === 0} data-testid="library-dup-delete"
          onClick={() => onDelete([...sel], () => load())}
        >
          <Trash2 className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.dupDelete', { count: sel.size, size: formatSize(freed) })}
        </Button>
      </div>
      <ul className="space-y-3">
        {groups.map((g, gi) => (
          <li key={g.files[0].path} className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground mb-2">{t('library.dupSet', { count: g.files.length, size: formatSize(g.size) })}</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {g.files.map((f, i) => (
                <div key={f.path} className="w-40 shrink-0" data-testid="library-dup-file">
                  <div className={`relative aspect-square rounded-lg overflow-hidden bg-muted ring-inset ${sel.has(f.path) ? 'ring-2 ring-destructive' : 'ring-1 ring-border'}`}>
                    <button type="button" className="w-full h-full" onClick={() => onOpen(g.files, i)} aria-label={f.name}>
                      <img src={thumbUrl(f.path, 320)} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" />
                    </button>
                    <button
                      type="button" role="checkbox" aria-checked={sel.has(f.path)} aria-label={t('library.select', { name: f.name })}
                      onClick={() => toggle(f.path)}
                      className={`absolute start-1.5 top-1.5 w-5 h-5 rounded-full border flex items-center justify-center ${sel.has(f.path) ? 'bg-destructive border-destructive text-white' : 'bg-black/40 border-white/80 text-transparent'}`}
                    >
                      <Check className="w-3 h-3" aria-hidden="true" />
                    </button>
                    {i === 0 && <span className="absolute end-1.5 top-1.5 rounded bg-black/60 text-white text-[10px] px-1.5 py-0.5">{t('library.dupOldest')}</span>}
                  </div>
                  <p className="mt-1 text-xs truncate" title={f.name}>{f.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate" title={f.folder}>{f.folder || t('library.rootName')} · {fmt(f.mtime)}</p>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
