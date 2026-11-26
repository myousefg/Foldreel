import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Film, ImageOff, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SiteAvatar } from '@/components/kit';
import { useI18n } from '@/context/I18nProvider';
import { parseSource } from '@/lib/jobMeta';
import { useJobs } from '@/context/JobsProvider';
import { jobsApi, thumbUrl } from '@/lib/api';
import { snappy } from '@/lib/motion';
import MediaLightbox from '@/components/MediaLightbox';

const INTERVALS = [15, 30, 60, 180, 360, 720, 1440];

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// A thumbnail that opens the picture at full size.
function Thumb({ f, onOpen }) {
  const [failed, setFailed] = useState(false);
  const Icon = f.kind === 'video' ? Film : ImageOff;
  return (
    <button
      type="button" onClick={onOpen} title={f.name} aria-label={f.name}
      className="relative block w-full aspect-square rounded-lg overflow-hidden border border-border bg-muted hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
    >
      {failed ? (
        <span className="w-full h-full flex items-center justify-center"><Icon className="w-5 h-5 text-muted-foreground" /></span>
      ) : (
        <img
          src={thumbUrl(f.path, 640)} alt="" loading="lazy" draggable={false}
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      )}
      {f.kind === 'video' && !failed && (
        <span className="absolute end-1.5 bottom-1.5 rounded bg-black/60 text-white p-1" aria-hidden="true"><Film className="w-3 h-3" /></span>
      )}
    </button>
  );
}

function WatchRow({ w, active, onUpdate, onRemove, onCheckNow }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);
  const [light, setLight] = useState(null);
  const panelId = useId();
  const canExpand = !!w.last_job_id && w.last_found > 0;
  const source = parseSource(w.url);

  const status = active
    ? t('watch.status.checking')
    : w.last_status === 'error'
      ? t('watch.status.error', { time: timeAgo(w.last_checked_at) })
      : w.last_found > 0
        ? t('watch.status.found', { count: w.last_found, time: timeAgo(w.last_checked_at) })
        : w.last_checked_at
          ? t('watch.status.upToDate', { time: timeAgo(w.last_checked_at) })
          : t('watch.status.never');

  const toggle = async () => {
    if (!canExpand) return;
    const next = !open;
    setOpen(next);
    if (next && files === null) {
      try { setFiles((await jobsApi.files(w.last_job_id)).files || []); }
      catch { setFiles([]); }
    }
  };

  return (
    <div className="" data-testid={`watch-${w.id}`}>
      <div className="row-hover flex items-center gap-4 px-3 py-3">
        <SiteAvatar url={w.url} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" title={w.url}>
            {source.host}
            {source.path && <span className="font-normal text-muted-foreground"> / {source.path}</span>}
          </p>
          <p className={`flex items-center gap-1.5 text-xs mt-0.5 truncate ${w.last_status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${w.last_status === 'error' ? 'bg-destructive' : w.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
              aria-hidden="true"
            />
            {w.enabled ? status : `${t('watch.paused')} · ${status}`}
          </p>
        </div>
        <Select value={String(w.interval_min)} onValueChange={v => onUpdate(w.id, { interval_min: Number(v) })}>
          <SelectTrigger className="w-28 h-8 text-xs" data-testid={`watch-interval-${w.id}`} aria-label={t('watch.interval.60')}><SelectValue /></SelectTrigger>
          <SelectContent>
            {INTERVALS.map(m => <SelectItem key={m} value={String(m)}>{t(`watch.interval.${m}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title={w.enabled ? t('watch.pause') : t('watch.resume')} aria-label={w.enabled ? t('watch.pause') : t('watch.resume')}
          onClick={() => onUpdate(w.id, { enabled: !w.enabled })}
        >
          {w.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </Button>
        <Button
          size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title={t('watch.checkNow')} aria-label={t('watch.checkNow')} disabled={active || !w.enabled}
          onClick={() => onCheckNow(w.id)}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
          title={t('watch.remove')} aria-label={t('watch.remove')} onClick={() => onRemove(w.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground"
          disabled={!canExpand} aria-expanded={open} aria-controls={panelId}
          aria-label={t('watch.viewFiles')}
          title={canExpand ? t('watch.viewFiles') : undefined}
          onClick={toggle}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''} ${canExpand ? '' : 'opacity-30'}`} />
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={snappy}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-3 pb-3 pt-1 border-t border-border bg-muted/20">
              {files === null && <p className="text-xs text-muted-foreground pt-2">{t('common.loading')}</p>}
              {files && files.length === 0 && <p className="text-xs text-muted-foreground pt-2">{t('watch.filesGone')}</p>}
              {files && files.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-2">
                  {files.slice(0, 24).map((f, i) => <Thumb key={f.path} f={f} onOpen={() => setLight(i)} />)}
                  {files.length > 24 && (
                    <span className="aspect-square rounded-lg border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground tabular-nums">
                      +{files.length - 24}
                    </span>
                  )}
                </div>
              )}
              {light != null && files && (
                <MediaLightbox files={files.slice(0, 24)} index={light} onIndex={setLight} onClose={() => setLight(null)} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function WatchSection({ watches, onUpdate, onRemove, onCheckNow, emptyMessage }) {
  const { t } = useI18n();
  const { active } = useJobs();
  const activeWatchIds = useMemo(
    () => new Set(active.filter(j => j.watch_id).map(j => j.watch_id)),
    [active],
  );

  if (!watches.length) {
    if (!emptyMessage) return null;
    return (
      <p className="px-3 py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  const update = async (id, patch) => {
    try { await onUpdate(id, patch); } catch { toast.error(t('watch.actionFailed')); }
  };
  const remove = async (id) => {
    try { await onRemove(id); toast.success(t('watch.removed')); } catch { toast.error(t('watch.actionFailed')); }
  };
  const checkNow = async (id) => {
    try { await onCheckNow(id); } catch { toast.error(t('watch.actionFailed')); }
  };

  return (
    <div className="list">
      {watches.map(w => (
        <WatchRow
          key={w.id} w={w} active={activeWatchIds.has(w.id)}
          onUpdate={update} onRemove={remove} onCheckNow={checkNow}
        />
      ))}
    </div>
  );
}
