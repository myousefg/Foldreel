import { useEffect, useState } from 'react';
import {
  Loader2, CheckCircle2, Download, Check, RefreshCw, Github,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Section, Row } from '@/components/settingsUi';
import { Segmented } from '@/components/kit';
import FilesPanel from '@/components/settings/FilesPanel';
import LanguageCombobox from '@/components/LanguageCombobox';
import ImportSection from '@/components/ImportSection';
import ComponentsRow from '@/components/ComponentsRow';
import { PageActions } from '@/components/PageHeader';
import LegalSection from '@/components/LegalSection';
import SubNav from '@/components/SubNav';
import { useI18n } from '@/context/I18nProvider';
import { useTheme } from '@/context/ThemeProvider';
import { useSettings } from '@/context/SettingsProvider';
import { isElectron, openExternal } from '@/lib/electron';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { settings: s, env, saveState, update, reloadEnv } = useSettings();
  const [tab, setTab] = useState('general');
  const [appUpdate, setAppUpdate] = useState({ status: 'idle' });
  useEffect(() => {
    if (!isElectron || !window.electronAPI.onAppUpdateStatus) return;
    return window.electronAPI.onAppUpdateStatus(setAppUpdate);
  }, []);
  const checkForAppUpdate = () => { setAppUpdate({ status: 'checking' }); window.electronAPI.checkForAppUpdate(); };

  const setAutostart = async (v) => {
    update({ autostart: v });
    if (isElectron) { try { await window.electronAPI.setAutoStart(v); } catch {} }
  };

  if (!s) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</div>;
  }

  const saveTag = {
    saving: <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> {t('settings.saving')}</span>,
    saved:  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="w-3 h-3" /> {t('settings.saved')}</span>,
    error:  <span className="text-destructive">{t('settings.saveFailed')}</span>,
    idle:   null,
  }[saveState];

  return (
    <SubNav
      label={t('nav.settings')} value={tab} onChange={setTab}
      tabs={[
        ['general', t('settings.appearance')],
        ['downloads', t('settings.files')],
        ['import', t('import.title')],
        ['about', t('settings.about')],
        ['legal', t('settings.legal')],
      ]}
    >
      <PageActions><div className="text-xs" aria-live="polite">{saveTag}</div></PageActions>

      {tab === 'downloads' && <FilesPanel s={s} env={env} update={update} reloadEnv={reloadEnv} />}

      {tab === 'import' && <ImportSection />}

      {tab === 'general' && (
      <Section label={t('settings.appearance')}>
        <Row title={t('settings.theme')}>
          <Segmented
            label={t('settings.theme')} value={theme} onChange={v => { setTheme(v); update({ theme: v }); }}
            options={[
              { value: 'light', label: t('settings.light') },
              { value: 'dark', label: t('settings.dark') },
              { value: 'system', label: t('settings.system') },
            ]}
          />
        </Row>
        <Row title={t('settings.language')}>
          <LanguageCombobox value={lang} onValueChange={v => { setLang(v); update({ language: v }); }} t={t} />
        </Row>
        <Row title={t('settings.startWithWindows')}>
          <Switch checked={!!s.autostart} onCheckedChange={setAutostart} disabled={!isElectron} />
        </Row>
        <Row title={t('settings.notifications')}>
          <Switch
            checked={s.notifications_enabled ?? true}
            onCheckedChange={v => update({ notifications_enabled: v })}
          />
        </Row>
      </Section>
      )}

      {tab === 'about' && (<>
      <Section label={t('settings.about')}>
        <Row
          title={
            <span className="inline-flex items-center gap-1.5">
              Foldreel
              <button
                type="button" onClick={() => openExternal('https://github.com/myousefg/Foldreel')}
                title={t('settings.aboutRepo')} aria-label={t('settings.aboutRepo')}
                className="text-muted-foreground/50 hover:text-muted-foreground"
              >
                <Github className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          }
          desc={t('settings.aboutTagline')}
        >
          <span className="text-xs font-mono text-muted-foreground">{env?.app_version || '…'}</span>
          {isElectron && (
            <div aria-live="polite">
              <AppUpdateControl appUpdate={appUpdate} onCheck={checkForAppUpdate} t={t} />
            </div>
          )}
        </Row>
        <ComponentsRow />
      </Section>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('foldreel:tour'))}
        className="px-3 text-xs text-muted-foreground underline hover:text-foreground"
      >
        {t('settings.replayTour')}
      </button>
      </>)}

      {tab === 'legal' && <LegalSection />}

    </SubNav>
  );
}

function AppUpdateControl({ appUpdate, onCheck, t }) {
  const { status, pct, version } = appUpdate;

  // The Store build is updated by the Store; there is nothing to check on GitHub.
  if (window.electronAPI?.isStore || status === 'store') {
    return <span className="text-[11px] text-muted-foreground">{t('settings.updateStore')}</span>;
  }

  if (status === 'checking') {
    return <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> {t('settings.updateChecking')}</span>;
  }
  if (status === 'downloading') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> {t('settings.updateDownloading')} {pct != null ? `${pct}%` : ''}
      </span>
    );
  }
  if (status === 'downloaded') {
    return (
      <Button size="sm" variant="default" onClick={() => window.electronAPI.installAppUpdate()}>
        <Download className="w-3.5 h-3.5 me-1.5" /> {t('settings.updateRestart')}
      </Button>
    );
  }
  if (status === 'available') {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-[11px] text-amber-600 dark:text-amber-400">{t('settings.updateAvail', { version })}</span>
        <Button size="sm" variant="outline" onClick={() => window.electronAPI.downloadAppUpdate()}>
          <Download className="w-3.5 h-3.5 me-1.5" /> {t('settings.updateDownload')}
        </Button>
      </span>
    );
  }
  if (status === 'current') {
    return (
      <button type="button" onClick={onCheck} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
        <CheckCircle2 className="w-3.5 h-3.5" /> {t('settings.updateCurrent')}
      </button>
    );
  }
  if (status === 'error') {
    return (
      <button
        type="button" onClick={onCheck}
        title={appUpdate.error || t('settings.updateFailed')}
        className="inline-flex items-center gap-1 text-[11px] text-destructive hover:underline"
      >
        <RefreshCw className="w-3 h-3" aria-hidden="true" /> {t('settings.updateFailed')}
        {appUpdate.error && <span className="text-muted-foreground font-mono">&nbsp;&middot; {appUpdate.error.slice(0, 60)}</span>}
      </button>
    );
  }
  return (
    <button type="button" onClick={onCheck} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
      <RefreshCw className="w-3 h-3" /> {t('settings.updateCheck')}
    </button>
  );
}
