import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  Loader2, FolderOpen, CheckCircle2, Download, Check, RefreshCw, Trash2, ChevronDown,
  Github,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Section, Row } from '@/components/settingsUi';
import LanguageCombobox from '@/components/LanguageCombobox';
import LegalSection, { COPYRIGHT_YEAR, COPYRIGHT_HOLDER } from '@/components/LegalSection';
import { useI18n } from '@/context/I18nProvider';
import { useTheme } from '@/context/ThemeProvider';
import { useSettings } from '@/context/SettingsProvider';
import { envApi, configOverridesApi } from '@/lib/api';
import { isElectron, openExternal } from '@/lib/electron';
import { snappy } from '@/lib/motion';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { settings: s, env, saveState, update } = useSettings();
  const [showCfg, setShowCfg] = useState(false);
  const [cfg, setCfg] = useState(null);
  const cfgPanelId = useId();
  const overridesPanelId = useId();

  const [showOverrides, setShowOverrides] = useState(false);
  const [overridesText, setOverridesText] = useState(null); // null = not loaded yet
  const [overridesSaved, setOverridesSaved] = useState(null);
  const [overridesError, setOverridesError] = useState('');
  const [overridesSaving, setOverridesSaving] = useState(false);
  const overridesDirty = overridesText !== null && overridesText !== overridesSaved;
  const openOverrides = () => {
    setShowOverrides(v => !v);
    if (overridesText === null) {
      configOverridesApi.get().then(({ overrides }) => {
        let pretty = overrides;
        try { pretty = JSON.stringify(JSON.parse(overrides), null, 2); } catch { /* show raw as-is */ }
        setOverridesText(pretty);
        setOverridesSaved(pretty);
      }).catch(() => { setOverridesText('{}'); setOverridesSaved('{}'); });
    }
  };
  const saveOverrides = async () => {
    setOverridesSaving(true);
    setOverridesError('');
    try {
      await configOverridesApi.update(overridesText);
      setOverridesSaved(overridesText);
      toast.success(t('settings.saved'));
      if (cfg) envApi.config().then(setCfg).catch(() => {});
    } catch (e) {
      setOverridesError(e?.response?.data?.detail || t('settings.configEditorInvalid'));
    } finally {
      setOverridesSaving(false);
    }
  };
  const resetOverrides = () => { setOverridesText(overridesSaved); setOverridesError(''); };

  const [cacheClearing, setCacheClearing] = useState(false);
  const clearCache = async () => {
    setCacheClearing(true);
    try { await envApi.clearCache(); toast.success(t('settings.cacheCleared')); }
    catch { toast.error(t('settings.clearCacheFailed')); }
    finally { setCacheClearing(false); }
  };

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
    <div className="space-y-8 pb-12">
      <header className="flex items-start justify-between">
        <div />
        <div className="text-xs mt-2 h-4">{saveTag}</div>
      </header>

      {env && (
        <Section label={t('settings.files')}>
          <Row title={t('settings.dataFolder')} desc={t('settings.dataFolderDesc')}>
            <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[280px] block">{env.data_dir}</code>
            {isElectron && (
              <Button variant="outline" size="icon" onClick={() => window.electronAPI.openPath(env.data_dir)} title={t('settings.openFolder')} aria-label={t('settings.openFolder')}>
                <FolderOpen className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </Row>
          <Row title={t('settings.downloadsFolder')}>
            <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[280px] block">{env.output_dir}</code>
            {isElectron && (
              <Button variant="outline" size="icon" onClick={() => window.electronAPI.openPath(env.output_dir)} title={t('settings.openFolder')} aria-label={t('settings.openFolder')}>
                <FolderOpen className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </Row>
          {env.cookies_dir && (
            <Row title={t('settings.cookiesFolder')} desc={t('settings.cookiesFolderInfo')}>
              <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[280px] block">{env.cookies_dir}</code>
              {isElectron && (
                <Button variant="outline" size="icon" onClick={() => window.electronAPI.openPath(env.cookies_dir)} title={t('settings.openFolder')} aria-label={t('settings.openFolder')}>
                  <FolderOpen className="w-4 h-4" aria-hidden="true" />
                </Button>
              )}
            </Row>
          )}
          <Row title={t('settings.defaultPhotoFormat')} desc={t('settings.defaultPhotoFormatDesc')}>
            <Select value={s.default_photo_format || 'keep'} onValueChange={v => update({ default_photo_format: v })}>
              <SelectTrigger className="w-40" data-testid="default-photo-format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">{t('settings.keepOriginal')}</SelectItem>
                <SelectItem value="jpg">JPG</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="webp">WEBP</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row title={t('settings.defaultVideoFormat')} desc={t('settings.defaultVideoFormatDesc')}>
            <Select value={s.default_video_format || 'keep'} onValueChange={v => update({ default_video_format: v })}>
              <SelectTrigger className="w-40" data-testid="default-video-format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">{t('settings.keepOriginal')}</SelectItem>
                <SelectItem value="mp4">MP4</SelectItem>
                <SelectItem value="webm">WEBM</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row title={t('settings.clearCache')} desc={t('settings.clearCacheDesc')}>
            <Button variant="outline" size="sm" onClick={clearCache} disabled={cacheClearing}>
              {cacheClearing ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 me-1.5" />}
              {t('settings.clearCache')}
            </Button>
          </Row>
          <div className="p-4">
            <button onClick={() => { setShowCfg(v => !v); if (!cfg) envApi.config().then(setCfg).catch(() => setCfg({})); }}
              aria-expanded={showCfg} aria-controls={cfgPanelId}
              className="text-xs underline text-muted-foreground hover:text-foreground">
              {showCfg ? t('settings.hideConfig') : t('settings.viewConfig')}
            </button>
            <AnimatePresence initial={false}>
              {showCfg && (
                <motion.div
                  id={cfgPanelId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={snappy}
                  style={{ overflow: 'hidden' }}
                >
                  <pre className="mt-2 max-h-64 overflow-auto rounded border border-border bg-muted/30 p-2 text-[11px] font-mono">
                    {cfg ? JSON.stringify(cfg, null, 2) : '…'}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="p-4 border-t border-border">
            <button onClick={openOverrides}
              aria-expanded={showOverrides} aria-controls={overridesPanelId}
              className="text-xs underline text-muted-foreground hover:text-foreground">
              {showOverrides ? t('settings.hideConfigEditor') : t('settings.editConfig')}
            </button>
            <AnimatePresence initial={false}>
              {showOverrides && (
                <motion.div
                  id={overridesPanelId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={snappy}
                  style={{ overflow: 'hidden' }}
                >
                  <p id={`${overridesPanelId}-desc`} className="text-xs text-muted-foreground leading-relaxed mt-2 mb-2 max-w-xl">
                    {t('settings.configEditorDesc')}
                  </p>
                  <textarea
                    value={overridesText ?? ''}
                    onChange={e => { setOverridesText(e.target.value); setOverridesError(''); }}
                    spellCheck={false}
                    placeholder={t('settings.configEditorPlaceholder')}
                    aria-label={t('settings.editConfig')}
                    aria-describedby={`${overridesPanelId}-desc`}
                    className="w-full h-48 rounded border border-border bg-muted/30 p-2 text-[11px] font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  {overridesError && (
                    <p className="text-xs text-destructive mt-1.5 font-mono whitespace-pre-wrap">{overridesError}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Button size="sm" onClick={saveOverrides} disabled={overridesSaving || !overridesDirty}>
                      {overridesSaving && <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />}
                      {t('settings.configEditorSave')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={resetOverrides} disabled={!overridesDirty || overridesSaving}>
                      {t('settings.configEditorReset')}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Section>
      )}

      <Section label={t('settings.appearance')}>
        <Row title={t('settings.theme')}>
          <Select value={theme} onValueChange={v => { setTheme(v); update({ theme: v }); }}>
            <SelectTrigger className="w-36" data-testid="theme-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t('settings.light')}</SelectItem>
              <SelectItem value="dark">{t('settings.dark')}</SelectItem>
              <SelectItem value="system">{t('settings.system')}</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row title={t('settings.language')}>
          <LanguageCombobox value={lang} onValueChange={v => { setLang(v); update({ language: v }); }} t={t} />
        </Row>
        <Row title={t('settings.startWithWindows')} desc={t('settings.startWithWindowsDesc')}>
          <Switch checked={!!s.autostart} onCheckedChange={setAutostart} disabled={!isElectron} />
        </Row>
        {!isElectron && <p className="px-4 pb-3 -mt-2 text-[11px] text-muted-foreground">{t('settings.autoStartElectronOnly')}</p>}
        <Row title={t('settings.notifications')} desc={t('settings.notificationsDesc')}>
          <Switch
            checked={s.notifications_enabled ?? true}
            onCheckedChange={v => update({ notifications_enabled: v })}
          />
        </Row>
      </Section>

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
        <Row title={t('settings.components')} desc={t('settings.componentsDesc')}>
          <div className="text-right text-xs font-mono text-muted-foreground space-y-0.5">
            <div>gallery-dl {env?.gallery_dl_version || '…'}</div>
            <div>
              ffmpeg {env?.ffmpeg ? t('settings.installed') : t('settings.notInstalled')}
              {'  ·  '}
              yt-dlp {env?.yt_dlp ? t('settings.installed') : t('settings.notInstalled')}
            </div>
          </div>
        </Row>
        <Row title={t('settings.copyright')} desc={t('settings.licenseDesc')}>
          <span className="text-xs text-muted-foreground text-right leading-relaxed">
            Copyright (c) {COPYRIGHT_YEAR} {COPYRIGHT_HOLDER}
            <br />MIT License
          </span>
        </Row>
      </Section>

      <LegalSection />

      <div className="flex items-center justify-between gap-3 pt-1 text-[11px] text-muted-foreground/60">
        <button
          onClick={() => window.dispatchEvent(new Event('foldreel:tour'))}
          className="underline hover:text-foreground"
        >
          {t('settings.replayTour')}
        </button>
        <span className="font-mono">
          backend 127.0.0.1:8767  ·  {typeof navigator !== 'undefined' ? (navigator.userAgent.match(/Electron\/[\d.]+/)?.[0] || 'browser') : ''}
        </span>
      </div>
    </div>
  );
}

function AppUpdateControl({ appUpdate, onCheck, t }) {
  const { status, pct, version } = appUpdate;

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
