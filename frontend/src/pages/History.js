import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AnimatePresence } from 'motion/react';
import { Search, Trash2, KeyRound, Library } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import JobInspector from '@/components/JobInspector';
import { PageActions, PageSubtitle } from '@/components/PageHeader';
import { EmptyState, JobThumb, Segmented, StatusBadge } from '@/components/kit';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';
import { dayLabel, fileCount, parseSource, timeAgo } from '@/lib/jobMeta';
import { useJobThumb } from '@/lib/useJobThumb';

function LibraryRow({ job, selected, onSelect, lang, t }) {
  const { ref, path: thumb } = useJobThumb(job);
  const { host, path } = parseSource(job.url);
  const flagged = job.hint === 'auth' || job.hint === 'cookies_locked' || job.hint === 'rate_limited';
  const result = job.files_error > 0 && !job.files_ok
    ? `${job.files_error} ${t('dashboard.errors')}`
    : `${job.total > 0 ? `${job.files_ok || 0}/${job.total} ${t('dashboard.files')}` : fileCount(job.files_ok || 0, t, lang)}${job.files_skipped ? ` · ${job.files_skipped} ${t('dashboard.skipped')}` : ''}`;

  return (
    <button
      type="button" onClick={onSelect} aria-pressed={selected} data-keep-inspector data-testid={`hist-${job.id}`}
      className={`row-hover w-full flex items-center gap-4 px-3 py-3 text-start focus-visible:outline-none focus-visible:bg-accent ${selected ? 'bg-accent' : ''}`}
    >
      <JobThumb url={job.url} path={thumb} size={40} thumbRef={ref} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate">
          {host}{path && <span className="font-normal text-muted-foreground"> / {path}</span>}
        </span>
        <span className="block text-xs text-muted-foreground truncate mt-0.5 tabular-nums">{result}</span>
      </span>
      {flagged && <KeyRound className="w-4 h-4 text-amber-500 shrink-0" aria-label={t('history.needsAttention')} />}
      <StatusBadge status={job.status} className="w-24 shrink-0 hidden sm:inline-flex">{t(`dashboard.status.${job.status}`)}</StatusBadge>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-14 text-end">{timeAgo(job.finished_at || job.created_at, lang)}</span>
    </button>
  );
}

export default function History() {
  const { t, lang } = useI18n();
  const { finished, clearFinished } = useJobs();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const counts = useMemo(() => ({
    all: finished.length,
    done: finished.filter(j => j.status === 'done').length,
    error: finished.filter(j => j.status === 'error').length,
    canceled: finished.filter(j => j.status === 'canceled').length,
  }), [finished]);

  const rows = useMemo(() => finished.filter(j => {
    if (status !== 'all' && j.status !== status) return false;
    if (query && !j.url.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [finished, query, status]);

  // Newest first, grouped under a heading per day.
  const groups = useMemo(() => {
    const out = [];
    for (const job of rows) {
      const label = dayLabel(job.finished_at || job.created_at, lang);
      const last = out[out.length - 1];
      if (last && last.label === label) last.jobs.push(job); else out.push({ label, jobs: [job] });
    }
    return out;
  }, [rows, lang]);

  const selectedId = params.get('job');
  const selected = selectedId ? finished.find(j => j.id === selectedId) : null;
  const select = (id) => setParams(id ? { job: id } : {}, { replace: true });
  const doClear = async () => { await clearFinished(); select(null); toast.success(t('history.clear')); };

  return (
    <div className="space-y-5 pb-12">
      <PageSubtitle>{t('history.summary', { count: finished.length })}</PageSubtitle>
      <PageActions>
        <div className="relative w-60">
          <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query} onChange={e => setQuery(e.target.value)} placeholder={t('history.search')}
            aria-label={t('history.search')} className="ps-9 h-8 text-sm" data-testid="history-search"
          />
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8" disabled={!finished.length}>
              <Trash2 className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('history.clear')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('history.clearConfirm')}</AlertDialogTitle>
              <AlertDialogDescription>{t('history.clearConfirmDesc')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={doClear}>{t('common.confirm')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageActions>

      <Segmented
        label={t('history.allStatus')} value={status} onChange={setStatus}
        options={[
          { value: 'all', label: t('history.allStatus'), count: counts.all },
          { value: 'done', label: t('dashboard.status.done'), count: counts.done },
          { value: 'error', label: t('dashboard.status.error'), count: counts.error },
          ...(counts.canceled > 0 ? [{ value: 'canceled', label: t('dashboard.status.canceled'), count: counts.canceled }] : []),
        ]}
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={Library} title={query ? t('history.noResults', { query }) : t('history.empty')}>
            {!query && t('history.emptyDesc')}
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map(g => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="text-[13px] font-semibold mb-1.5 px-3">{g.label}</h2>
              <div className="list">
                {g.jobs.map(job => (
                  <LibraryRow key={job.id} job={job} lang={lang} t={t} selected={job.id === selectedId} onSelect={() => select(job.id === selectedId ? null : job.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && <JobInspector key={selected.id} job={selected} onClose={() => select(null)} />}
      </AnimatePresence>
    </div>
  );
}
