import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Check, ChevronDown, Copy, Download, Link2, Loader2, Puzzle, RefreshCw, ShieldOff, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Section, Row } from '@/components/settingsUi';
import { useI18n } from '@/context/I18nProvider';
import { useSettings } from '@/context/SettingsProvider';
import { extensionApi } from '@/lib/api';
import { isElectron, openExternal } from '@/lib/electron';
import { timeAgo } from '@/lib/jobMeta';

// Set once the Chrome Web Store listing is live; until then the extension is offered as a folder to load.
const CHROME_STORE_URL = '';

const SEEN_RECENTLY_MS = 14 * 24 * 3600 * 1000;

export default function ExtensionPanel() {
  const { t, lang } = useI18n();
  const { settings: s, reloadSettings } = useSettings();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const [, tick] = useState(0);

  const secret = s.extension_secret || '';
  const linked = !!(secret && s.extension_last_used);
  const seenAt = s.extension_seen_at ? Date.parse(s.extension_seen_at) : 0;
  const detected = seenAt > 0 && Date.now() - seenAt < SEEN_RECENTLY_MS;
  const until = s.extension_link_until ? Date.parse(s.extension_link_until) : 0;
  const linking = !linked && until > Date.now();

  // While waiting for the extension to check in, look for it every couple of seconds.
  useEffect(() => {
    if (!linking) return undefined;
    const id = setInterval(() => { reloadSettings(); tick((n) => n + 1); }, 2000);
    return () => clearInterval(id);
  }, [linking, reloadSettings]);

  const wasLinking = useState({ v: false })[0];
  useEffect(() => {
    if (wasLinking.v && linked) toast.success(t('extension.linkedToast'));
    wasLinking.v = linking;
  }, [linking, linked, t, wasLinking]);

  const run = async (fn, okMessage) => {
    setBusy(true);
    try { await fn(); await reloadSettings(); if (okMessage) toast.success(okMessage); }
    catch { toast.error(t('settings.saveFailed')); }
    finally { setBusy(false); }
  };

  const openFolder = async () => {
    if (!isElectron) return;
    try {
      const dir = await window.electronAPI.getExtensionDir();
      if (dir) await window.electronAPI.openPath(dir); else toast.error(t('settings.saveFailed'));
    } catch { toast.error(t('settings.saveFailed')); }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error(t('settings.saveFailed')); }
  };

  const status = linked
    ? { tone: 'bg-emerald-500', text: t('extension.linked'), detail: s.extension_version ? t('extension.version', { version: s.extension_version }) : '' }
    : detected
      ? { tone: 'bg-amber-500', text: t('extension.foundNotLinked'), detail: s.extension_version ? t('extension.version', { version: s.extension_version }) : '' }
      : { tone: 'bg-muted-foreground/40', text: t('extension.notFound'), detail: '' };

  return (
    <>
      <Section label={t('settings.extension')}>
        {/* what is going on right now */}
        <div className="flex items-start gap-3 px-3 py-4" data-testid="extension-status">
          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${status.tone}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {status.text}
              {status.detail && <span className="font-normal text-muted-foreground"> · {status.detail}</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {linked
                ? t('extension.linkedDesc', { time: timeAgo(s.extension_last_used, lang) })
                : detected
                  ? t('extension.foundDesc', { time: timeAgo(s.extension_seen_at, lang) })
                  : t('extension.notFoundDesc')}
            </p>
          </div>
          {!linked && !linking && (
            <Button size="sm" onClick={() => run(extensionApi.link)} disabled={busy} data-testid="extension-link">
              {busy ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" aria-hidden="true" /> : <Link2 className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />}
              {t('extension.link')}
            </Button>
          )}
        </div>

        {linking && (
          <div className="px-3 py-4 bg-muted/30 space-y-2" role="status" data-testid="extension-waiting">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" aria-hidden="true" /> {t('extension.waiting')}
            </div>
            <ol className="list-decimal ps-5 text-xs text-muted-foreground space-y-0.5">
              <li>{t('extension.step1')}</li>
              <li>{t('extension.step2')}</li>
            </ol>
            <Button size="sm" variant="ghost" className="-ms-2" onClick={() => run(extensionApi.cancelLink)} disabled={busy}>
              <X className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('common.cancel')}
            </Button>
          </div>
        )}

        {!detected && !linked && (
          <Row
            title={CHROME_STORE_URL ? t('settings.extensionDownload') : t('settings.extensionOpenFolder')}
            desc={CHROME_STORE_URL ? t('settings.extensionDownloadStoreDesc') : t('settings.extensionOpenFolderDesc')}
          >
            <Button variant="outline" size="sm" onClick={CHROME_STORE_URL ? () => openExternal(CHROME_STORE_URL) : openFolder}>
              <Download className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />
              {CHROME_STORE_URL ? t('settings.extensionDownloadStore') : t('settings.extensionOpenFolder')}
            </Button>
          </Row>
        )}

        {linked && (
          <Row title={t('settings.extensionDisable')} desc={t('extension.unlinkDesc')}>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy}>
                  <ShieldOff className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('extension.unlink')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('settings.extensionDisableConfirm')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('settings.extensionDisableConfirmDesc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => run(extensionApi.disable)}>{t('common.confirm')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Row>
        )}
      </Section>

      <section className="space-y-2" aria-label={t('extension.manualTitle')}>
        <button
          type="button" onClick={() => setManual((v) => !v)} aria-expanded={manual}
          className="flex items-center gap-1.5 px-3 text-[13px] font-semibold hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          data-testid="extension-manual-toggle"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${manual ? '' : '-rotate-90'}`} aria-hidden="true" />
          {t('extension.manualTitle')}
        </button>
        {manual && (
          <div className="list">
            {!secret ? (
              <Row title={t('settings.extensionEnable')} desc={t('extension.manualDesc')}>
                <Button size="sm" onClick={() => run(extensionApi.enable)} disabled={busy}>
                  <Puzzle className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('settings.extensionEnable')}
                </Button>
              </Row>
            ) : (
              <>
                <Row title={t('settings.extensionCode')} desc={t('settings.extensionCodeDesc')}>
                  <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[220px] block">{secret}</code>
                  <Button variant="outline" size="icon" onClick={copySecret} title={t('settings.extensionCopy')} aria-label={copied ? t('settings.extensionCopied') : t('settings.extensionCopy')}>
                    {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                  </Button>
                </Row>
                <Row title={t('settings.extensionRegenerate')} desc={t('settings.extensionRegenerateDesc')}>
                  <Button variant="outline" size="sm" onClick={() => run(extensionApi.enable)} disabled={busy}>
                    <RefreshCw className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('settings.extensionRegenerate')}
                  </Button>
                </Row>
              </>
            )}
          </div>
        )}
      </section>

      <p className="px-3 text-xs text-muted-foreground leading-relaxed max-w-xl" data-testid="extension-scope-note">
        {t('extension.sameComputer')}
      </p>
    </>
  );
}
