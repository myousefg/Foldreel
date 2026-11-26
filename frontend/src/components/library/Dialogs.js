import { useEffect, useMemo, useState } from 'react';
import { Check, Hash, Minus, Plus } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** The "are you sure" for deleting for good, worded like the one in Windows. */
export function PermanentDeleteDialog({ open, names, count, onConfirm, onCancel, t }) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent data-testid="library-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('library.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {count === 1 ? t('library.deleteOne', { name: names[0] || '' }) : t('library.deleteMany', { count })}
            {' '}{t('library.deleteWarn')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm} data-testid="library-delete-confirm"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('library.deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Tags for the selected files. Each chip shows whether all, some or none of them have it;
 * clicking adds it to all (or takes it off when all have it). Changes apply as you click.
 */
export function TagsDialog({ open, onClose, items, count, known, onChange, t }) {
  const [text, setText] = useState('');
  useEffect(() => { if (open) setText(''); }, [open]);

  const state = useMemo(() => {
    const have = new Map();
    for (const it of items) for (const tg of it.tags || []) have.set(tg.toLowerCase(), (have.get(tg.toLowerCase()) || 0) + 1);
    return have;
  }, [items]);

  const names = useMemo(() => {
    const seen = new Map();
    for (const tg of known) seen.set(tg.toLowerCase(), tg);
    for (const it of items) for (const tg of it.tags || []) if (!seen.has(tg.toLowerCase())) seen.set(tg.toLowerCase(), tg);
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [known, items]);

  const level = (tg) => {
    const n = state.get(tg.toLowerCase()) || 0;
    if (!n) return 'none';
    return n >= count ? 'all' : 'some';
  };

  const add = () => {
    const v = text.trim();
    if (!v) return;
    onChange([v], []);
    setText('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="library-tags-dialog">
        <DialogHeader>
          <DialogTitle>{t('library.tagsTitle', { count })}</DialogTitle>
          <DialogDescription>{t('library.tagsHint')}</DialogDescription>
        </DialogHeader>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Input
            value={text} onChange={(e) => setText(e.target.value)} placeholder={t('library.tagPlaceholder')} maxLength={40}
            aria-label={t('library.tagPlaceholder')} autoFocus data-testid="library-tag-input"
          />
          <Button type="submit" size="sm" disabled={!text.trim()}><Plus className="w-3.5 h-3.5 me-1" aria-hidden="true" />{t('library.tagAdd')}</Button>
        </form>
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto" role="group" aria-label={t('library.tags')}>
          {names.length === 0 && <p className="text-xs text-muted-foreground">{t('library.noTags')}</p>}
          {names.map((tg) => {
            const l = level(tg);
            return (
              <button
                key={tg} type="button" aria-pressed={l === 'all' ? true : l === 'some' ? 'mixed' : false}
                onClick={() => (l === 'all' ? onChange([], [tg]) : onChange([tg], []))}
                data-testid={`tag-chip-${tg}`}
                className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  l === 'all' ? 'bg-primary text-primary-foreground border-primary' : l === 'some' ? 'bg-primary/15 border-primary/50' : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                {l === 'all' ? <Check className="w-3 h-3" aria-hidden="true" /> : l === 'some' ? <Minus className="w-3 h-3" aria-hidden="true" /> : <Hash className="w-3 h-3" aria-hidden="true" />}
                {tg}
              </button>
            );
          })}
        </div>
        <DialogFooter><Button onClick={onClose}>{t('common.done')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
