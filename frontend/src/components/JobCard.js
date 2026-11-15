import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  X, RotateCcw, Trash2, FolderOpen, Terminal, KeyRound, Timer, Pause, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { JobThumb, StatusBadge } from '@/components/kit';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';
import { jobsApi } from '@/lib/api';
import { isElectron } from '@/lib/electron';
import { fileCount, parseSource } from '@/lib/jobMeta';
import { useCooldownTick, useTrickleProgress, HINT_KEY } from '@/lib/jobHints';
import { useJobThumb } from '@/lib/useJobThumb';
import { snappy } from '@/lib/motion';

const LINE_COLOR = {
  file: 'text-foreground',
  skip: 'text-muted-foreground',
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-destructive',
  info: 'text-muted-foreground',
};

function IconAction({ label, onClick, testId, children, tone = '' }) {
  return (
    <Button
      size="icon" variant="ghost" onClick={onClick} data-testid={testId}
      title={label} aria-label={label}
      className={`h-8 w-8 text-muted-foreground hover:text-foreground ${tone}`}
    >
      {children}
    </Button>
  );
}

// One row of the queue: what it is, how far along, what state, and the controls.
export default function JobCard({ job }) {
  const { t, lang } = useI18n();
  const { logs, cancel, pause, retry, remove, setJobOpen } = useJobs();
  const [open, setOpen] = useState(false);
  const [fullLog, setFullLog] = useState(null);
  const logPanelId = useId();

  const live = logs[job.id] || [];
  const active = job.status === 'running' || job.status === 'queued';
  const cooldown = useCooldownTick(job);
  const trickle = useTrickleProgress(job);
  const { ref: thumbRef, path: thumbPath } = useJobThumb(job);
  const { host, path } = parseSource(job.url);

  // Tells JobsProvider this row is expanded, so a just-finished job doesn't
  // vanish out of the queue mid-read.
  useEffect(() => () => setJobOpen(job.id, false), [job.id, setJobOpen]);

  const toggleLog = async () => {
    const next = !open;
    setOpen(next);
    setJobOpen(job.id, next);
    if (next && !active && fullLog === null) {
      try { setFullLog((await jobsApi.log(job.id)).log || ''); } catch { setFullLog(''); }
    }
  };
  const openFolder = () => { if (isElectron && job.dest_dir) window.electronAPI.openPath(job.dest_dir); };

  let subtitle = null;
  if (job.status === 'running' && job.current_file) subtitle = <span className="font-mono">{job.current_file}</span>;
  else if (job.status === 'error' && job.error_text) subtitle = <span className="text-destructive">{job.error_text.split('\n')[0]}</span>;
  else if (job.status === 'queued') subtitle = t('dashboard.status.queued');
  else subtitle = `${fileCount(job.files_ok || 0, t, lang)}${job.files_skipped > 0 ? ` · ${job.files_skipped} ${t('dashboard.skipped')}` : ''}`;

  const pct = job.total > 0
    ? Math.min(100, ((job.files_ok || 0) / job.total) * 100)
    : job.status === 'running' && job.pct != null ? job.pct
      : job.status === 'running' && trickle != null ? trickle : null;

  return (
    <div data-testid={`job-${job.id}`}>
      <div className="group row-hover flex items-center gap-4 px-3 py-3">
        <JobThumb url={job.url} path={thumbPath} size={40} thumbRef={thumbRef} />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" title={job.url}>
            {host}
            {path && <span className="font-normal text-muted-foreground"> / {path}</span>}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
        </div>

        <div className="hidden md:block w-40 shrink-0">
          {active && (
            <>
              <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums mb-1">
                <span>{job.files_ok || 0}{job.total > 0 ? ` / ${job.total}` : ''}</span>
                {pct != null && <span>{Math.round(pct)}%</span>}
              </div>
              {pct != null ? <Progress value={pct} className="h-1" /> : <Progress indeterminate className="h-1" />}
            </>
          )}
        </div>

        <div role="status" aria-live="polite" className="w-24 shrink-0">
          <StatusBadge status={job.status}>{t(`dashboard.status.${job.status}`)}</StatusBadge>
        </div>

        <div className="flex items-center shrink-0">
          {job.status === 'running' && (
            <IconAction label={t('dashboard.pause')} onClick={() => pause(job.id)} testId="job-pause"><Pause className="w-4 h-4" /></IconAction>
          )}
          {active && (
            <IconAction label={t('dashboard.stop')} onClick={() => cancel(job.id)} testId="job-cancel"><X className="w-4 h-4" /></IconAction>
          )}
          {!active && (
            <>
              <IconAction label={job.status === 'paused' ? t('dashboard.resume') : t('dashboard.retry')} onClick={() => retry(job.id)} testId="job-retry">
                {job.status === 'paused' ? <Play className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              </IconAction>
              {isElectron && job.dest_dir && (
                <IconAction label={t('dashboard.openFolder')} onClick={openFolder}><FolderOpen className="w-4 h-4" /></IconAction>
              )}
              <IconAction label={t('dashboard.remove')} onClick={() => remove(job.id)} testId="job-remove"><Trash2 className="w-4 h-4" /></IconAction>
            </>
          )}
          <Button
            size="icon" variant="ghost" onClick={toggleLog} aria-expanded={open} aria-controls={logPanelId}
            title={open ? t('dashboard.hideLog') : t('dashboard.log')} aria-label={open ? t('dashboard.hideLog') : t('dashboard.log')}
            className={`h-8 w-8 ${open ? 'text-foreground bg-accent' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Terminal className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {((job.hint === 'auth' || job.hint === 'cookies_locked') && (job.status === 'error' || job.status === 'done')) && (
        <Link
          to="/sites"
          className="mx-3 mb-3 -mt-1 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
        >
          <KeyRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {t(HINT_KEY[job.hint])}
        </Link>
      )}
      {job.hint === 'rate_limited' && job.status === 'error' && (
        <p className="mx-3 mb-3 -mt-1 inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400">
          <Timer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {cooldown > 0 ? t('dashboard.rateLimitedWait', { min: cooldown }) : t('dashboard.rateLimited')}
        </p>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={logPanelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={snappy}
            style={{ overflow: 'hidden' }}
          >
            <ScrollArea className="h-48 mx-3 mb-3 rounded-md border border-border bg-muted/40">
              <pre className="p-3 text-[11px] font-mono leading-relaxed">
                {active
                  ? (live.length
                      ? live.map((l, i) => <div key={i} className={LINE_COLOR[l.kind] || ''}>{l.text}</div>)
                      : <span className="text-muted-foreground">…</span>)
                  : (fullLog ?? '…')}
              </pre>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
