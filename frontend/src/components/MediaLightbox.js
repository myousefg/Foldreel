import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, FolderOpen, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nProvider';
import { thumbUrl } from '@/lib/api';
import { isElectron } from '@/lib/electron';

// One picture or video frame at full size, with the way into the real file.
// files: [{ path, name, kind }]; index picks the current one.
export default function MediaLightbox({ files, index, onIndex, onClose }) {
  const { t } = useI18n();
  const closeRef = useRef(null);
  const file = files[index];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < files.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, files.length, onIndex, onClose]);

  if (!file) return null;
  const open = () => isElectron && window.electronAPI.openPath(file.path);
  const reveal = () => isElectron && window.electronAPI.showInFolder && window.electronAPI.showInFolder(file.path);

  return (
    <div
      role="dialog" aria-modal="true" aria-label={file.name} data-keep-inspector
      className="fixed inset-0 z-[60] flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div className="flex items-center gap-3 h-14 px-4 shrink-0 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate text-sm" title={file.path}>{file.name}</p>
        <span className="text-xs text-white/60 tabular-nums">{index + 1} / {files.length}</span>
        {isElectron && (
          <>
            <Button size="sm" variant="secondary" className="h-8" onClick={open}>
              <ExternalLink className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('library.open')}
            </Button>
            <Button size="icon" variant="secondary" className="h-8 w-8" onClick={reveal} title={t('library.showInFolder')} aria-label={t('library.showInFolder')}>
              <FolderOpen className="w-4 h-4" aria-hidden="true" />
            </Button>
          </>
        )}
        <Button ref={closeRef} size="icon" variant="secondary" className="h-8 w-8" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}>
          <X className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-16 pb-6">
        <img
          key={file.path} src={thumbUrl(file.path, 1600)} alt={file.name} draggable={false}
          className="max-w-full max-h-full object-contain rounded-md"
          onClick={(e) => e.stopPropagation()}
        />
        {file.kind === 'video' && isElectron && (
          <button
            type="button" onClick={(e) => { e.stopPropagation(); open(); }} aria-label={t('library.play')}
            className="absolute w-16 h-16 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Play className="w-7 h-7 ms-1" aria-hidden="true" />
          </button>
        )}
        {index > 0 && (
          <button
            type="button" aria-label={t('library.previous')} onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}
            className="absolute start-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="w-5 h-5 rtl:rotate-180" aria-hidden="true" />
          </button>
        )}
        {index < files.length - 1 && (
          <button
            type="button" aria-label={t('library.next')} onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}
            className="absolute end-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="w-5 h-5 rtl:rotate-180" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
