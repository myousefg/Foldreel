import { useState } from 'react';
import { toast } from 'sonner';
import { Check, FolderOpen, Loader2, Search, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, Row } from '@/components/settingsUi';
import { useI18n } from '@/context/I18nProvider';
import { useSettings } from '@/context/SettingsProvider';
import { useJobs } from '@/context/JobsProvider';
import { importApi } from '@/lib/api';
import { isElectron } from '@/lib/electron';

// What can come across, in display order. `count` reads the inspect payload;
// null means "no count to show" and 0 means "nothing there, so not offered".
const CATEGORIES = [
  { key: 'settings', count: () => null },
  { key: 'presets', count: (s) => s.presets },
  { key: 'history', count: (s) => s.history },
  { key: 'watches', count: (s) => s.watches },
  { key: 'sites', count: (s) => s.sites },
  { key: 'cookies', count: (s) => s.cookie_files },
  { key: 'archive', count: (s) => s.archive_entries },
  { key: 'tokens', count: (s) => (s.has_tokens ? null : 0) },
];

const pickable = (cat, source) => cat.count(source) !== 0;
const CHECKBOX = 'mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary cursor-pointer';

export default function ImportSection() {
  const { t } = useI18n();
  const { reloadSettings, reloadEnv } = useSettings();
  const { refresh: reloadJobs } = useJobs();
  const [busy, setBusy] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [source, setSource] = useState(null);
  const [picked, setPicked] = useState({});
  const [connect, setConnect] = useState(true);
  const [result, setResult] = useState(null);

  const choose = (info) => {
    setSource(info);
    setPicked(Object.fromEntries(CATEGORIES.map((c) => [c.key, pickable(c, info)])));
    setConnect(info.output_exists);
    setResult(null);
    setNotFound(false);
  };

  const scan = async () => {
    setBusy('scan');
    try {
      const { sources, source_running: running } = await importApi.detect();
      if (!sources.length) { setNotFound(true); return; }
      choose({ ...sources[0], source_running: running });
    } catch {
      toast.error(t('import.scanFailed'));
    } finally {
      setBusy('');
    }
  };

  const browse = async () => {
    const folder = await window.electronAPI.selectFolder({ title: t('import.chooseTitle') });
    if (!folder) return;
    try {
      choose(await importApi.inspect(folder));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('import.badFolder'));
    }
  };

  const run = async () => {
    setBusy('run');
    try {
      const res = await importApi.run({ path: source.path, include: picked, connect_folder: connect && source.output_exists });
      setResult(res);
      reloadSettings();
      reloadEnv();
      reloadJobs(); // the jobs list is loaded once at startup, so History would stay empty until a restart
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('import.failed'));
    } finally {
      setBusy('');
    }
  };

  const nothingPicked = !Object.values(picked).some(Boolean) && !(connect && source?.output_exists);
  const added = result
    ? CATEGORIES.filter((c) => typeof result[c.key] === 'number' && result[c.key] > 0 && c.key !== 'settings')
    : [];

  return (
    <Section label={t('import.title')}>
      <Row title={t('import.row')} desc={t('import.rowDesc')}>
        <Button variant="outline" size="sm" onClick={scan} disabled={!!busy}>
          {busy === 'scan' ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" aria-hidden="true" /> : <Search className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />}
          {t('import.find')}
        </Button>
        {isElectron && (
          <Button variant="outline" size="sm" onClick={browse} disabled={!!busy}>
            <FolderOpen className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('import.choose')}
          </Button>
        )}
      </Row>

      {notFound && <p role="status" className="px-4 py-3 text-sm text-muted-foreground">{t('import.none')}</p>}

      {source && (
        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm font-medium">{t('import.found', { app: source.app })}</p>
            <p className="font-mono text-xs text-muted-foreground break-all">{source.path}</p>
          </div>

          {source.source_running && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              {t('import.running', { app: source.app })}
            </p>
          )}

          <fieldset className="space-y-2.5">
            <legend className="sr-only">{t('import.whatLegend')}</legend>
            {CATEGORIES.filter((c) => pickable(c, source)).map((c) => {
              const n = c.count(source);
              const id = `import-${c.key}`;
              return (
                <div key={c.key} className="flex items-start gap-2.5">
                  <input
                    id={id} type="checkbox" checked={!!picked[c.key]}
                    onChange={(e) => setPicked((p) => ({ ...p, [c.key]: e.target.checked }))}
                    className={CHECKBOX}
                  />
                  <label htmlFor={id} className="text-sm leading-snug cursor-pointer">
                    {t(`import.cat.${c.key}`)}{n ? <span className="text-muted-foreground"> ({n.toLocaleString()})</span> : null}
                    <span className="block text-xs text-muted-foreground">{t(`import.catDesc.${c.key}`)}</span>
                  </label>
                </div>
              );
            })}
          </fieldset>

          <div className="border-t border-border pt-4">
            {source.output_exists ? (
              <div className="flex items-start gap-2.5">
                <input id="import-folder" type="checkbox" checked={connect} onChange={(e) => setConnect(e.target.checked)} className={CHECKBOX} />
                <label htmlFor="import-folder" className="text-sm leading-snug cursor-pointer">
                  {t('import.reconnect')}
                  <span className="block font-mono text-xs text-muted-foreground break-all">{source.output_dir}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t('import.reconnectDesc', {
                      count: `${source.output_files.toLocaleString()}${source.output_files_truncated ? '+' : ''}`,
                    })}
                  </span>
                </label>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {source.output_dir ? t('import.folderMissing', { path: source.output_dir }) : t('import.folderUnset')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={run} disabled={!!busy || nothingPicked}>
              {busy === 'run' && <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" aria-hidden="true" />}
              {t('import.run')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('import.safe', { app: source.app })}</span>
          </div>

          {result && (
            <div role="status" className="rounded-md bg-muted/50 px-3 py-2.5 text-sm space-y-1">
              <p className="flex items-center gap-1.5 font-medium"><Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> {t('import.done')}</p>
              {added.length > 0 && (
                <ul className="text-xs text-muted-foreground">
                  {added.map((c) => <li key={c.key}>{t(`import.cat.${c.key}`)}: {result[c.key].toLocaleString()}</li>)}
                </ul>
              )}
              {result.connected_folder && <p className="text-xs text-muted-foreground">{t('import.folderConnected')}</p>}
              {result.backup && <p className="text-xs text-muted-foreground">{t('import.backup')}</p>}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
