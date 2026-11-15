import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Row } from '@/components/settingsUi';
import { useI18n } from '@/context/I18nProvider';
import { toolsApi } from '@/lib/api';

const NAMES = ['gallery-dl', 'yt-dlp', 'ffmpeg', 'aria2c'];
const WORKING = ['downloading', 'installing'];

// The four tools Foldreel is built on. Checking and updating both run on the
// backend in the background; this only starts them and reports what comes back.
export default function ComponentsRow() {
  const { t } = useI18n();
  const [tools, setTools] = useState(null);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState({});   // name -> true while we expect progress
  const [errors, setErrors] = useState({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const polling = useRef(false);

  const load = useCallback((check = false) => toolsApi.list(check).then(setTools), []);

  useEffect(() => { load(false).catch(() => {}); }, [load]);

  const runCheck = useCallback(async () => {
    setChecking(true);
    try {
      await load(true);
      setChecked(true);
    } catch {
      toast.error(t('components.checkFailed'));
    } finally {
      setChecking(false);
    }
  }, [load, t]);

  // While an update runs, poll for its progress (a download can take a minute).
  const busy = Object.keys(pending).length > 0
    || (tools && NAMES.some((n) => WORKING.includes(tools[n]?.progress?.status)));
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(async () => {
      // A poll can take a couple of seconds (it runs each tool's --version), so never
      // let two overlap: out-of-order replies would overwrite each other.
      if (polling.current) return;
      polling.current = true;
      try {
        const next = await toolsApi.list(false);
        // Take only the progress from a poll. It does not compare versions, so letting it
        // replace the table would wipe the result of "Check for updates" (a bundled tool
        // reads as "current" without a check).
        setTools((prev) => (prev
          ? Object.fromEntries(NAMES.map((n) => [n, { ...prev[n], progress: next[n]?.progress }]))
          : next));
        const finished = Object.keys(pendingRef.current).filter((n) => ['done', 'error'].includes(next[n]?.progress?.status));
        if (!finished.length) return;
        const failed = finished.filter((n) => next[n].progress.status === 'error');
        setErrors((e) => ({ ...e, ...Object.fromEntries(failed.map((n) => [n, next[n].progress.error])) }));
        // Re-check first and only then drop "Updating": clearing it earlier flashes the old
        // "Update available" for a moment before the new version is known.
        if (finished.some((n) => next[n].progress.status === 'done')) await runCheck();
        setPending((p) => { const q = { ...p }; finished.forEach((n) => delete q[n]); return q; });
      } catch { /* backend busy; try again next tick */ } finally {
        polling.current = false;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [busy, runCheck]);

  const update = async (name) => {
    setErrors((e) => { const q = { ...e }; delete q[name]; return q; });
    setPending((p) => ({ ...p, [name]: true }));
    try {
      await toolsApi.install(name);
    } catch (e) {
      setPending((p) => { const q = { ...p }; delete q[name]; return q; });
      setErrors((x) => ({ ...x, [name]: e?.response?.data?.detail || t('components.updateFailed') }));
    }
  };

  const status = (name, tool) => {
    const p = tool.progress || {};
    if (pending[name] || WORKING.includes(p.status)) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          {t('components.updating')}{p.status === 'downloading' && p.pct != null ? ` ${p.pct}%` : ''}
        </span>
      );
    }
    if (errors[name]) {
      return (
        <span className="inline-flex items-center gap-2 text-xs text-destructive">
          <span className="max-w-[220px] truncate" title={errors[name]}>{errors[name]}</span>
          {tool.can_install && <Button size="sm" variant="outline" className="h-7" onClick={() => update(name)}>{t('components.retry')}</Button>}
        </span>
      );
    }
    if (!checked) return null;
    if (tool.avail === 'current') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> {t('components.upToDate')}
        </span>
      );
    }
    if (tool.avail === 'update' || tool.avail === 'install') {
      return tool.can_install ? (
        <Button size="sm" variant="outline" className="h-7" onClick={() => update(name)}>
          <Download className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />
          {tool.avail === 'install' ? t('components.install') : t('components.updateTo', { version: tool.latest })}
        </Button>
      ) : (
        <span className="text-xs text-amber-700 dark:text-amber-400">{t('components.storeNote', { version: tool.latest })}</span>
      );
    }
    return <span className="text-xs text-muted-foreground">{t('components.cantCheck')}</span>;
  };

  return (
    <>
      <Row title={t('settings.components')} desc={t('settings.componentsDesc')}>
        <Button size="sm" variant="outline" onClick={runCheck} disabled={checking || !!busy} data-testid="components-check">
          {checking
            ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" aria-hidden="true" />
            : <RefreshCw className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />}
          {checking ? t('components.checking') : t('components.check')}
        </Button>
      </Row>
      <ul className="divide-y divide-border" aria-label={t('settings.components')} aria-live="polite">
        {NAMES.map((name) => {
          const tool = tools?.[name];
          return (
            <li key={name} className="flex items-center justify-between gap-4 px-4 py-2.5" data-testid={`component-${name}`}>
              <span className="min-w-0">
                <span className="text-sm font-medium">{name}</span>
                <span className="ms-3 font-mono text-xs text-muted-foreground">
                  {tool ? (tool.found ? tool.version : t('components.notInstalled')) : '…'}
                </span>
              </span>
              {tool && status(name, tool)}
            </li>
          );
        })}
      </ul>
    </>
  );
}
