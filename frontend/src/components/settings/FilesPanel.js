import { useId, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, FolderOpen, FolderSearch, Loader2, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Section, Row } from '@/components/settingsUi';
import { TokenMenu, NAME_TOKENS, NAME_TOKEN_TEXT, PATH_TOKENS, PATH_TOKEN_TEXT } from '@/components/OutputSettings';
import { useI18n } from '@/context/I18nProvider';
import { envApi, configOverridesApi } from '@/lib/api';
import { isElectron } from '@/lib/electron';
import { snappy } from '@/lib/motion';

const FOLDER_STRUCTURES = ['site_user', 'site', 'flat', 'custom'];
const tail = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(p || '');

function PathCell({ path, onOpen, t }) {
  return (
    <>
      <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[300px] block text-end" title={path}>{path}</code>
      {isElectron && onOpen !== false && (
        <Button variant="outline" size="icon" onClick={() => window.electronAPI.openPath(path)} title={t('settings.openFolder')} aria-label={t('settings.openFolder')}>
          <FolderOpen className="w-4 h-4" aria-hidden="true" />
        </Button>
      )}
    </>
  );
}

// The Files tab: where downloads go and what they are called, what happens to them, and storage.
export default function FilesPanel({ s, env, update, reloadEnv }) {
  const { t } = useI18n();
  const folder = s.output_dir || env?.output_dir || '';

  const changeFolder = async () => {
    if (!isElectron) return;
    const picked = await window.electronAPI.selectFolder({ title: t('settings.outputDir'), defaultPath: folder || undefined });
    if (!picked) return;
    update({ output_dir: picked });
    setTimeout(() => reloadEnv?.(), 900);
    toast.success(t('files.changed', { name: tail(picked) }));
  };

  const addToken = (key, token, sep = '') => {
    const cur = s[key] || '';
    update({ [key]: cur + (cur && sep && !cur.endsWith(sep) ? sep : '') + token });
  };

  // ── technical: the generated and the custom gallery-dl configuration ───────
  const cfgPanelId = useId();
  const overridesPanelId = useId();
  const [showTech, setShowTech] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [showOverrides, setShowOverrides] = useState(false);
  const [overridesText, setOverridesText] = useState(null); // null = not loaded yet
  const [overridesSaved, setOverridesSaved] = useState(null);
  const [overridesError, setOverridesError] = useState('');
  const [overridesSaving, setOverridesSaving] = useState(false);
  const overridesDirty = overridesText !== null && overridesText !== overridesSaved;
  const openOverrides = () => {
    setShowOverrides((v) => !v);
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

  const [cacheClearing, setCacheClearing] = useState(false);
  const clearCache = async () => {
    setCacheClearing(true);
    try { await envApi.clearCache(); toast.success(t('settings.cacheCleared')); }
    catch { toast.error(t('settings.clearCacheFailed')); }
    finally { setCacheClearing(false); }
  };

  return (
    <>
      <Section label={t('files.whereTitle')}>
        <Row title={t('settings.downloadsFolder')}>
          {isElectron ? <PathCell path={folder} t={t} /> : (
            <Input value={s.output_dir || ''} onChange={(e) => update({ output_dir: e.target.value })} className="w-80 font-mono text-xs" data-testid="output-dir" aria-label={t('settings.downloadsFolder')} />
          )}
          {isElectron && (
            <Button variant="outline" size="sm" onClick={changeFolder} data-testid="change-folder">
              <FolderSearch className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('files.change')}
            </Button>
          )}
        </Row>
        <Row title={t('files.layout')}>
          <Select value={s.folder_structure || 'site_user'} onValueChange={(v) => update({ folder_structure: v })}>
            <SelectTrigger className="w-64" data-testid="folder-structure"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FOLDER_STRUCTURES.map((f) => <SelectItem key={f} value={f}>{t(`settings.fs.${f}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Row>
        {s.folder_structure === 'custom' && (
          <Row title={t('settings.folderCustom')} desc={t('settings.folderCustomDesc')}>
            <Input value={s.folder_custom || ''} onChange={(e) => update({ folder_custom: e.target.value })} placeholder="{category}/{user[name]}" className="w-64 font-mono text-xs" aria-label={t('settings.folderCustom')} />
            <TokenMenu tokens={PATH_TOKENS} text={PATH_TOKEN_TEXT} onPick={(tok) => addToken('folder_custom', tok, '/')} />
          </Row>
        )}
        <Row title={t('files.names')}>
          <Input value={s.filename_format || ''} onChange={(e) => update({ filename_format: e.target.value })} placeholder="{category}_{id}.{extension}" className="w-64 font-mono text-xs" aria-label={t('files.names')} data-testid="filename-format" />
          <TokenMenu tokens={NAME_TOKENS} text={NAME_TOKEN_TEXT} onPick={(tok) => addToken('filename_format', tok)} />
        </Row>
      </Section>

      <Section label={t('files.convertTitle')}>
        <Row title={t('settings.defaultPhotoFormat')}>
          <Select value={s.default_photo_format || 'keep'} onValueChange={(v) => update({ default_photo_format: v })}>
            <SelectTrigger className="w-40" data-testid="default-photo-format"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">{t('settings.keepOriginal')}</SelectItem>
              <SelectItem value="jpg">JPG</SelectItem>
              <SelectItem value="png">PNG</SelectItem>
              <SelectItem value="webp">WEBP</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row title={t('settings.defaultVideoFormat')}>
          <Select value={s.default_video_format || 'keep'} onValueChange={(v) => update({ default_video_format: v })}>
            <SelectTrigger className="w-40" data-testid="default-video-format"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">{t('settings.keepOriginal')}</SelectItem>
              <SelectItem value="mp4">MP4</SelectItem>
              <SelectItem value="webm">WEBM</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section label={t('files.deleteTitle')}>
        <Row title={t('settings.deleteMode')}>
          <Select value={s.delete_mode || 'recycle'} onValueChange={(v) => update({ delete_mode: v })}>
            <SelectTrigger className="w-56" data-testid="delete-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recycle">{t('settings.deleteRecycle')}</SelectItem>
              <SelectItem value="permanent">{t('settings.deletePermanent')}</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>

      {env && (
        <Section label={t('files.storageTitle')}>
          <Row title={t('settings.dataFolder')}><PathCell path={env.data_dir} t={t} /></Row>
          {env.cookies_dir && <Row title={t('settings.cookiesFolder')}><PathCell path={env.cookies_dir} t={t} /></Row>}
          <Row title={t('settings.clearCache')}>
            <Button variant="outline" size="sm" onClick={clearCache} disabled={cacheClearing}>
              {cacheClearing ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 me-1.5" />}
              {t('settings.clearCache')}
            </Button>
          </Row>
        </Section>
      )}

      <section className="space-y-2">
        <button
          type="button" onClick={() => setShowTech((v) => !v)} aria-expanded={showTech} data-testid="settings-technical"
          className="flex items-center gap-1.5 px-3 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTech ? '' : '-rotate-90'}`} aria-hidden="true" />
          {t('files.technical')}
        </button>
        {showTech && (
          <div className="list">
            <div className="p-4">
              <button
                onClick={() => { setShowCfg((v) => !v); if (!cfg) envApi.config().then(setCfg).catch(() => setCfg({})); }}
                aria-expanded={showCfg} aria-controls={cfgPanelId} className="text-xs underline text-muted-foreground hover:text-foreground"
              >
                {showCfg ? t('settings.hideConfig') : t('settings.viewConfig')}
              </button>
              <AnimatePresence initial={false}>
                {showCfg && (
                  <motion.div id={cfgPanelId} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={snappy} style={{ overflow: 'hidden' }}>
                    <pre className="mt-2 max-h-64 overflow-auto rounded border border-border bg-muted/30 p-2 text-[11px] font-mono">{cfg ? JSON.stringify(cfg, null, 2) : '...'}</pre>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="p-4">
              <button
                onClick={openOverrides} aria-expanded={showOverrides} aria-controls={overridesPanelId}
                className="text-xs underline text-muted-foreground hover:text-foreground"
              >
                {showOverrides ? t('settings.hideConfigEditor') : t('settings.editConfig')}
              </button>
              <AnimatePresence initial={false}>
                {showOverrides && (
                  <motion.div id={overridesPanelId} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={snappy} style={{ overflow: 'hidden' }}>
                    <textarea
                      value={overridesText ?? ''} onChange={(e) => { setOverridesText(e.target.value); setOverridesError(''); }}
                      spellCheck={false} placeholder={t('settings.configEditorPlaceholder')} aria-label={t('settings.editConfig')}
                      className="mt-2 w-full h-48 rounded border border-border bg-muted/30 p-2 text-[11px] font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {overridesError && <p className="text-xs text-destructive mt-1.5 font-mono whitespace-pre-wrap">{overridesError}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <Button size="sm" onClick={saveOverrides} disabled={overridesSaving || !overridesDirty}>
                        {overridesSaving && <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />}
                        {t('settings.configEditorSave')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setOverridesText(overridesSaved); setOverridesError(''); }} disabled={!overridesDirty || overridesSaving}>
                        {t('settings.configEditorReset')}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
