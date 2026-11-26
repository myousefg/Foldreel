import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Copy, FolderOpen, FolderX, Film, ImageOff, KeyRound, Play, RotateCcw, Terminal, Timer, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SiteAvatar, StatusBadge } from '@/components/kit';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';
import { useSettings } from '@/context/SettingsProvider';
import { jobsApi, thumbUrl } from '@/lib/api';
import { isElectron } from '@/lib/electron';
import { fileCount, parseSource, timeAgo } from '@/lib/jobMeta';
import { useCooldownTick, HINT_KEY } from '@/lib/jobHints';
import { snappy } from '@/lib/motion';

function samePath(a, b) {
  if (!a || !b) return false;
  const norm = (s) => s.replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

// Previews keep each file's own proportions. Images come from the backend resized to
// fit the panel; videos show one extracted frame. A file that can't render shows its name.
function FilePreview({ f }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => isElectron && window.electronAPI.openPath(f.path)}
      title={f.name} aria-label={f.name}
      className="group relative block w-full rounded-lg overflow-hidden bg-muted ring-1 ring-inset ring-border hover:ring-ring transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {failed ? (
        <span className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
          {f.kind === 'video' ? <Film className="w-4 h-4" aria-hidden="true" /> : <ImageOff className="w-4 h-4" aria-hidden="true" />}
          <span className="truncate max-w-[70%]">{f.name}</span>
        </span>
      ) : (
        <img
          src={thumbUrl(f.path, 1080)} alt="" loading="lazy"
          onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
          className={`block w-full h-auto transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0 min-h-24'}`}
        />
      )}
      {f.kind === 'video' && !failed && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/70 transition-colors">
            <Play className="w-5 h-5 text-white ms-0.5" fill="currentColor" aria-hidden="true" />
          </span>
        </span>
      )}
    </button>
  );
}

// A panel that slides in from the right. The list stays visible behind it, a click on
// another row switches to that job, and a click anywhere else (or Escape) closes it.
export default function JobInspector({ job, onClose }) {
  const { t, lang } = useI18n();
  const { retry, remove, deleteFiles } = useJobs();
  const { env } = useSettings();
  const [log, setLog] = useState(null);
  const [files, setFiles] = useState(null);
  const [found, setFound] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const panelRef = useRef(null);
  const cooldown = useCooldownTick(job);
  const { host, path } = parseSource(job.url);
  const flagged = job.hint === 'auth' || job.hint === 'cookies_locked';
  // A shared download root would be wiped by a whole-folder delete; the backend
  // refuses that, so say so up front instead of offering a button that fails.
  const sharedDest = samePath(job.dest_dir, env?.output_dir) && !(job.files_ok > 0);

  useEffect(() => {
    setLog(null); setFiles(null); setFound(0); setShowLog(false); setShowAll(false);
    let cancelled = false;
    // A re-check that skipped everything still has files in its folder to show.
    if (job.files_ok > 0 || job.files_skipped > 0) {
      jobsApi.files(job.id, 300)
        .then((r) => { if (!cancelled) { setFiles(r.files || []); setFound(r.count || 0); } })
        .catch(() => { if (!cancelled) setFiles([]); });
    } else {
      setFiles([]);
    }
    return () => { cancelled = true; };
  }, [job.id, job.files_ok, job.files_skipped]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    // Dialogs opened from inside the panel render in a portal, so they count as inside.
    const onPointer = (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (panelRef.current && panelRef.current.contains(el)) return;
      if (el.closest('[role="alertdialog"], [role="dialog"], [data-radix-popper-content-wrapper], [data-keep-inspector], [data-sonner-toast]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);

  const toggleLog = async () => {
    const next = !showLog;
    setShowLog(next);
    if (next && log === null) {
      try { setLog((await jobsApi.log(job.id)).log || ''); } catch { setLog(''); }
    }
  };
  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(job.url); toast.success(t('history.copied')); } catch { /* clipboard blocked */ }
  };

  const shown = files ? (showAll ? files : files.slice(0, 4)) : [];
  // Count what is actually on disk, not what the job reported: files can be moved or deleted later.
  const more = files && !showAll ? Math.max(0, files.length - shown.length) : 0;
  const missing = files ? Math.max(0, (job.files_ok || 0) - found) : 0;
  const counts = [
    job.files_ok > 0 && fileCount(job.files_ok, t, lang),
    job.files_skipped > 0 && `${job.files_skipped} ${t('dashboard.skipped')}`,
    job.files_error > 0 && `${job.files_error} ${t('dashboard.errors')}`,
  ].filter(Boolean);

  return (
    <motion.aside
      ref={panelRef}
      role="dialog" aria-modal="false" aria-label={`${host} ${path}`}
      initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={snappy}
      className="fixed top-0 right-0 bottom-0 z-30 w-[min(480px,100vw)] flex flex-col bg-card border-l border-border shadow-2xl"
      data-testid={`inspector-${job.id}`}
    >
      <header className="flex items-center gap-3 h-14 px-4 border-b border-border shrink-0">
        <SiteAvatar url={job.url} size={28} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold truncate leading-5">{host}</h2>
          {path && <p className="text-xs text-muted-foreground truncate leading-4">{path}</p>}
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
          <X className="w-4 h-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {files && files.length > 0 && (
          <section aria-label={t('dashboard.files')} className="p-4 space-y-2.5">
            {shown.map((f) => <FilePreview key={f.path} f={f} />)}
            {more > 0 && (
              <button
                type="button" onClick={() => setShowAll(true)}
                className="w-full h-9 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              >
                +{more}
              </button>
            )}
            {missing > 0 && (
              <p className="text-xs text-muted-foreground px-1">{t('history.filesMissing', { count: missing })}</p>
            )}
          </section>
        )}

        <div className="px-4 pb-4 pt-1 space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <StatusBadge status={job.status}>{t(`dashboard.status.${job.status}`)}</StatusBadge>
            {counts.map((c) => <span key={c} className="tabular-nums">· {c}</span>)}
            <span className="ms-auto tabular-nums">{timeAgo(job.finished_at || job.created_at, lang)}</span>
          </div>

          {job.error_text && (
            <p className="text-xs font-mono text-destructive whitespace-pre-wrap rounded-md bg-destructive/10 p-3">{job.error_text}</p>
          )}
          {flagged && (
            <Link to="/sites" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 transition-colors">
              <KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> {t(HINT_KEY[job.hint])}
            </Link>
          )}
          {job.hint === 'rate_limited' && (
            <p className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <Timer className="w-3.5 h-3.5" aria-hidden="true" />
              {cooldown > 0 ? t('dashboard.rateLimitedWait', { min: cooldown }) : t('dashboard.rateLimited')}
            </p>
          )}

          <dl className="rounded-lg border border-border divide-y divide-border text-xs">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <dt className="w-12 shrink-0 text-muted-foreground">{t('history.folder')}</dt>
              <dd className="font-mono truncate flex-1 min-w-0" title={job.dest_dir}>{job.dest_dir || '-'}</dd>
            </div>
            <div className="flex items-center gap-3 px-3 py-2">
              <dt className="w-12 shrink-0 text-muted-foreground">URL</dt>
              <dd className="font-mono truncate flex-1 min-w-0" title={job.url}>{job.url}</dd>
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 -me-1" onClick={copyUrl} aria-label={t('history.copyUrl')} title={t('history.copyUrl')}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </dl>

          <section>
            <button
              type="button" onClick={toggleLog} aria-expanded={showLog}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Terminal className="w-3.5 h-3.5" aria-hidden="true" /> {showLog ? t('dashboard.hideLog') : t('dashboard.log')}
            </button>
            {showLog && (
              <ScrollArea className="h-48 mt-2 rounded-md border border-border bg-muted/40">
                <pre className="p-3 text-[11px] font-mono leading-relaxed">{log ?? t('common.loading')}</pre>
              </ScrollArea>
            )}
          </section>
        </div>
      </div>

      <footer className="flex items-center gap-2 flex-wrap p-3 border-t border-border shrink-0">
        <Button size="sm" onClick={() => retry(job.id)}>
          <RotateCcw className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('history.reDownload')}
        </Button>
        {isElectron && job.dest_dir && (
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => window.electronAPI.openPath(job.dest_dir)} title={t('history.openFolder')} aria-label={t('history.openFolder')}>
            <FolderOpen className="w-4 h-4" aria-hidden="true" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => { remove(job.id); onClose(); }} title={t('history.remove')} aria-label={t('history.remove')}>
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </Button>
        <div className="ms-auto">
          {sharedDest ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm" variant="ghost" aria-disabled="true"
                  className="text-muted-foreground/60 hover:text-muted-foreground/60 hover:bg-transparent cursor-default"
                  onClick={() => toast.info(t('history.sharedFolderNote'))}
                >
                  <FolderX className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('history.delete')}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-relaxed">{t('history.sharedFolderNote')}</TooltipContent>
            </Tooltip>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" title={t('history.deleteConfirmDesc')}>
                  <FolderX className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('history.delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('history.deleteConfirm')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('history.deleteConfirmDesc')}
                    {job.dest_dir && <span className="block mt-1 font-mono text-[11px] break-all">{job.dest_dir}</span>}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        const r = await deleteFiles(job.id);
                        toast.success(t('history.deleted', { count: r?.removed ?? 0 }));
                        onClose();
                      } catch (e) {
                        toast.error(e?.response?.data?.detail || t('history.deleteFailed'));
                      }
                    }}
                  >
                    {t('common.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </footer>
    </motion.aside>
  );
}
