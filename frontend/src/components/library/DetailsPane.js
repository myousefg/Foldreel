import { useEffect, useState } from 'react';
import { ExternalLink, Folder, FolderOpen, Hash, Star, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { libraryApi, thumbUrl } from '@/lib/api';
import { isElectron } from '@/lib/electron';
import { formatSize } from '@/lib/utils';

function Field({ label, children }) {
  if (children == null || children === '') return null;
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-[13px] break-words">{children}</dd>
    </div>
  );
}

/**
 * Side panel for the selection: a preview and details for one file, a summary for several,
 * and for nothing selected, the folder you are in.
 */
export default function DetailsPane({
  entry, count, bytes, folderLabel, summary, fmt, onFavorite, onTags, onOpen, onGoto, onFilter, onClose, t,
}) {
  const [info, setInfo] = useState(null);
  const path = entry?.type === 'file' ? entry.path : null;
  useEffect(() => {
    setInfo(null);
    if (!path) return undefined;
    let cancelled = false;
    libraryApi.info(path).then((r) => { if (!cancelled) setInfo(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [path]);

  const file = entry?.type === 'file' ? { ...entry, ...(info || {}) } : null;

  return (
    <aside aria-label={t('library.details')} className="h-full overflow-y-auto border-s border-border ps-4 pe-1 pb-4" data-testid="library-details">
      <div className="flex items-center justify-between h-9">
        <h3 className="text-[13px] font-semibold">{t('library.details')}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label={t('common.close')}><X className="w-4 h-4" aria-hidden="true" /></Button>
      </div>

      {count === 0 && (
        <div className="space-y-2 text-[13px]">
          <div className="flex items-center gap-2 font-medium"><Folder className="w-4 h-4" aria-hidden="true" />{folderLabel}</div>
          <p className="text-muted-foreground">{summary}</p>
          <p className="text-xs text-muted-foreground">{t('library.detailsHint')}</p>
        </div>
      )}

      {count > 1 && (
        <div className="space-y-3 text-[13px]">
          <p className="font-medium">{t('library.selected', { count })}</p>
          {bytes != null && <p className="text-muted-foreground">{formatSize(bytes)}</p>}
          <Button size="sm" variant="outline" onClick={onTags}><Tag className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.tagsAction')}</Button>
        </div>
      )}

      {count === 1 && entry && (
        <div className="space-y-3">
          <div className="rounded-lg overflow-hidden bg-muted aspect-[4/3] flex items-center justify-center">
            {entry.type === 'folder'
              ? (entry.cover ? <img src={thumbUrl(entry.cover, 640)} alt="" className="w-full h-full object-cover" draggable={false} /> : <Folder className="w-10 h-10 text-muted-foreground" aria-hidden="true" />)
              : <img src={thumbUrl(entry.path, 640)} alt="" className="w-full h-full object-contain" draggable={false} />}
          </div>
          <p className="text-[13px] font-medium break-all">{entry.name}</p>

          {file && (
            <>
              <div className="flex gap-1.5 flex-wrap">
                <Button size="sm" variant="outline" onClick={onOpen}><ExternalLink className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.open')}</Button>
                <Button size="sm" variant={file.fav ? 'default' : 'outline'} onClick={onFavorite} aria-pressed={!!file.fav}>
                  <Star className="w-3.5 h-3.5 me-1.5" fill={file.fav ? 'currentColor' : 'none'} aria-hidden="true" />{t(file.fav ? 'library.unfavorite' : 'library.favorite')}
                </Button>
                <Button size="sm" variant="outline" onClick={onTags}><Tag className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.tagsAction')}</Button>
              </div>
              {(file.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {file.tags.map((tg) => (
                    <button key={tg} type="button" onClick={() => onFilter({ tag: tg })} className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] bg-muted hover:bg-accent">
                      <Hash className="w-3 h-3" aria-hidden="true" />{tg}
                    </button>
                  ))}
                </div>
              )}
              <dl className="space-y-2">
                <Field label={t('library.col.type')}>{(file.ext || '').replace('.', '').toUpperCase() || file.kind}</Field>
                <Field label={t('library.dimensions')}>{file.width ? `${file.width} × ${file.height}` : null}</Field>
                <Field label={t('library.col.size')}>{formatSize(file.size)}</Field>
                <Field label={t('library.col.modified')}>{fmt(file.mtime)}</Field>
                <Field label={t('library.site')}>{file.site}</Field>
                <Field label={t('library.creator')}>{file.creator}</Field>
                <Field label={t('library.series')}>{file.series}</Field>
                <Field label={t('library.col.folder')}>
                  <button type="button" onClick={() => onGoto(file.folder)} className="inline-flex items-center gap-1 text-start hover:underline">
                    <FolderOpen className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />{file.folder || t('library.rootName')}
                  </button>
                </Field>
              </dl>
            </>
          )}

          {entry.type === 'folder' && (
            <dl className="space-y-2">
              <Field label={t('library.col.type')}>{t('library.folderType')}</Field>
              <Field label={t('library.contains')}>{t('library.folderMeta', { count: entry.count, size: formatSize(entry.size) })}</Field>
              <Field label={t('library.location')}>{entry.rel}</Field>
              {isElectron && (
                <Button size="sm" variant="outline" onClick={onOpen}><FolderOpen className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('library.openFolder')}</Button>
              )}
            </dl>
          )}
        </div>
      )}
    </aside>
  );
}
