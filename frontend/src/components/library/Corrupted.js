import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FileWarning, FolderOpen, Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { libraryApi, thumbUrl } from '@/lib/api';
import { formatSize } from '@/lib/utils';

function Thumb({ file }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <FileWarning className="w-5 h-5 text-muted-foreground" aria-hidden="true" />;
  return <img src={thumbUrl(file.path, 320)} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} className="w-full h-full object-cover" />;
}

/**
 * Files that will not open or play to the end: a picture cut short, a video that never finished downloading.
 * Looks at what it has not seen yet each time the page opens; tick the broken ones and delete them.
 */
export default function Corrupted({ version, onDelete, t, fmt }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [deep, setDeep] = useState(false);
  const timer = useRef(null);
  const started = useRef(false);

  const load = useCallback(async () => {
    try {
      const d = await libraryApi.corrupted();
      setData(d); setError(false);
      return d;
    } catch {
      setError(true);
      return null;
    }
  }, []);

  // While a scan runs, ask how far it is a few times a second.
  const poll = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const d = await load();
      if (d?.running) poll();
      else setSel((prev) => new Set([...prev].filter((p) => d?.files.some((f) => f.path === p))));
    }, 700);
  }, [load]);

  const scan = useCallback(async (full) => {
    try {
      await libraryApi.corruptScan(full);
      await load();
      poll();
    } catch { setError(true); }
  }, [load, poll]);

  useEffect(() => {
    load().then((d) => {
      if (!started.current) { started.current = true; scan(false); } else if (d?.running) poll();
    });
    return () => clearTimeout(timer.current);
  }, [load, scan, poll, version]);

  const files = data?.files || [];
  const toggle = (p) => setSel((prev) => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const allOn = files.length > 0 && files.every((f) => sel.has(f.path));
  const freed = files.filter((f) => sel.has(f.path)).reduce((sum, f) => sum + f.size, 0);

  if (error && !data) return <p className="py-16 text-center text-sm text-muted-foreground">{t('library.corruptFailed')}</p>;
  if (!data) {
    return (
      <p className="py-16 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      </p>
    );
  }

  const pct = data.total ? Math.round((data.done * 100) / data.total) : 0;

  return (
    <div className="space-y-4" data-testid="library-corrupted">
      <div className="flex items-center gap-3 flex-wrap min-h-8">
        {data.running ? (
          <div className="flex items-center gap-3 flex-1 min-w-[260px]" role="status" data-testid="library-corrupt-progress">
            <Progress value={pct} className="h-2 flex-1" />
            <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">{t('library.corruptChecking', { done: data.done, total: data.total })}</span>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => libraryApi.corruptStop()}><X className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.corruptStop')}</Button>
          </div>
        ) : (
          <>
            <p className="text-[13px]" data-testid="library-corrupt-summary">
              {files.length ? t('library.corruptSummary', { count: files.length }) : t('library.corruptNone', { count: data.checked })}
            </p>
            <Button size="sm" variant="outline" className="h-8" onClick={() => scan(deep)} data-testid="library-corrupt-recheck">
              <RefreshCw className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.corruptRecheck')}
            </Button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={deep} onCheckedChange={setDeep} aria-label={t('library.corruptDeep')} data-testid="library-corrupt-deep" />
              {t('library.corruptDeep')}
            </label>
          </>
        )}
        {files.length > 0 && (
          <div className="flex items-center gap-2 ms-auto">
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setSel(allOn ? new Set() : new Set(files.map((f) => f.path)))}>
              {allOn ? t('library.corruptNoneSel') : t('library.corruptAll')}
            </Button>
            <Button
              size="sm" variant="destructive" className="h-8" disabled={sel.size === 0} data-testid="library-corrupt-delete"
              onClick={() => onDelete([...sel], () => { setSel(new Set()); load(); })}
            >
              <Trash2 className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.dupDelete', { count: sel.size, size: formatSize(freed) })}
            </Button>
          </div>
        )}
      </div>

      {!data.running && files.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Check className="w-6 h-6 mx-auto mb-2" aria-hidden="true" />{t('library.corruptNoneBody')}
        </div>
      )}

      <ul className="rounded-xl border border-border divide-y divide-border/60 empty:hidden">
        {files.map((f) => (
          <li key={f.path} className={`flex items-center gap-3 px-3 py-2 ${sel.has(f.path) ? 'bg-destructive/10' : ''}`} data-testid="library-corrupt-file">
            <button
              type="button" role="checkbox" aria-checked={sel.has(f.path)} aria-label={t('library.select', { name: f.name })}
              onClick={() => toggle(f.path)}
              className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center ${sel.has(f.path) ? 'bg-destructive border-destructive text-white' : 'border-muted-foreground/60 text-transparent'}`}
            >
              <Check className="w-3 h-3" aria-hidden="true" />
            </button>
            <span className="w-10 h-10 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0"><Thumb file={f} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium truncate" title={f.name}>{f.name}</p>
              <p className="text-xs text-destructive truncate" title={f.reason}>{f.reason}</p>
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-[220px] hidden md:block" title={f.folder}>{f.folder || t('library.rootName')} · {formatSize(f.size)} · {fmt(f.mtime)}</span>
            {typeof window !== 'undefined' && window.electronAPI?.showInFolder && (
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => window.electronAPI.showInFolder(f.path)} title={t('library.showInFolder')} aria-label={t('library.showInFolder')}>
                <FolderOpen className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
