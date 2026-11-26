import { useEffect, useMemo, useState } from 'react';
import { Check, Folder, FolderPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/context/I18nProvider';
import { libraryApi } from '@/lib/api';

// Pick a folder under the download folder (or make a new one) for the selected files.
export default function LibraryMoveDialog({ open, count, current, onClose, onMove }) {
  const { t } = useI18n();
  const [folders, setFolders] = useState([]);
  const [dest, setDest] = useState('');
  const [filter, setFilter] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setDest(current || ''); setFilter(''); setNewName(''); setBusy(false);
    libraryApi.folders().then((r) => { if (!cancelled) setFolders(r.folders || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, current]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? folders.filter((d) => d.toLowerCase().includes(f)) : folders;
  }, [folders, filter]);

  const submit = async () => {
    setBusy(true);
    try { await onMove(dest, newName.trim()); } finally { setBusy(false); }
  };

  const row = (rel, label, depth) => {
    const on = dest === rel;
    return (
      <button
        key={rel || '__root'} type="button" role="radio" aria-checked={on} onClick={() => setDest(rel)}
        className={`w-full flex items-center gap-2 h-8 rounded-md text-[13px] text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
        style={{ paddingInlineStart: 8 + depth * 16 }}
      >
        <Folder className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="truncate flex-1" title={rel || label}>{label}</span>
        {on && <Check className="w-4 h-4 me-2 shrink-0" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md" data-keep-inspector>
        <DialogHeader>
          <DialogTitle>{t('library.moveTitle', { count })}</DialogTitle>
        </DialogHeader>
        <Input
          value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('library.findFolder')}
          aria-label={t('library.findFolder')} className="h-9"
        />
        <div role="radiogroup" aria-label={t('library.moveDest')} className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-0.5">
          {!filter && row('', t('library.rootName'), 0)}
          {shown.map((d) => row(d, d.split('/').pop(), filter ? 0 : d.split('/').length))}
          {filter && shown.length === 0 && <p className="text-xs text-muted-foreground px-2 py-3">{t('library.noFolders')}</p>}
        </div>
        <div className="flex items-center gap-2">
          <FolderPlus className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <Input
            value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('library.newFolderHere')}
            aria-label={t('library.newFolderHere')} className="h-9"
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) submit(); }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={busy} data-testid="library-move-confirm">
            {busy && <Loader2 className="w-4 h-4 me-2 animate-spin" aria-hidden="true" />}
            {t('library.move')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
