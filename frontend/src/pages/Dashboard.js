import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownToLine, Eye, Loader2, AlertTriangle, ClipboardPaste, Bell, Link2, Folder, ChevronDown, FileCheck2, Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import JobCard from '@/components/JobCard';
import PreviewDialog from '@/components/PreviewDialog';
import { OutputFields } from '@/components/OutputSettings';
import { PageSubtitle } from '@/components/PageHeader';
import { Chip } from '@/components/kit';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';
import { useSettings } from '@/context/SettingsProvider';
import { isElectron } from '@/lib/electron';
import { presetsApi, watchesApi } from '@/lib/api';
import { folderTail } from '@/lib/jobMeta';
import { snappy, listItem } from '@/lib/motion';

const MODES = ['auto', 'page', 'scan', 'video'];
// Foldreel passes URLs straight to gallery-dl, so a mode is just a prefix.
// "video" hands the URL to gallery-dl's own bundled "ytdl:" extractor
// (yt-dlp as a library) instead of its normal site extractors - for a page
// gallery-dl has no extractor for at all, or where its extractor only grabs
// images and skips an embedded video.
const MODE_PREFIX = { auto: '', page: 'generic:', scan: 'r:', video: 'ytdl:' };

// Sites with a real gallery-dl extractor. "Whole page" / "Scan" only grab page
// chrome here (Instagram etc. render posts via JS), so warn if a mode is picked.
const DEDICATED = /(?:^|\.)(?:instagram|twitter|x|nitter|reddit|redd|pixiv|fanbox|fantia|patreon|deviantart|tumblr|artstation|newgrounds|flickr|weibo|pinterest|kemono|coomer|danbooru|gelbooru|e621|e926|rule34|konachan|yande|sankakucomplex|zerochan|bsky|mastodon\.social|threads\.net|facebook|tiktok|youtube|bilibili)\.\w/i;

function splitUrls(text) {
  return text.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
}

function hasDedicatedExtractor(url) {
  try { return DEDICATED.test(new URL(url.replace(/^[a-z-]+:(?=https?:)/i, '')).hostname); }
  catch { return false; }
}

const YOUTUBE_RE = /(?:^|\.)(?:youtube\.com|youtu\.be|music\.youtube\.com)$/i;
function isYoutubeUrl(url) {
  try { return YOUTUBE_RE.test(new URL(url.replace(/^[a-z-]+:(?=https?:)/i, '')).hostname); }
  catch { return false; }
}

// A link that points straight at a file, or at a video stream, needs no page scraping: the file is
// fetched as it is. Said out loud, so people know pasting one works.
const DIRECT_FILE = /\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?|mp4|m4v|webm|mkv|mov|avi|wmv|flv|mp3|m4a|aac|flac|wav|ogg|opus)(?:[?#]|$)/i;
const STREAM_LINK = /\.(?:m3u8|mpd)(?:[?#]|$)/i;
const pathOf = (url) => url.replace(/^[a-z-]+:(?=https?:)/i, '');
const isStreamLink = (url) => STREAM_LINK.test(pathOf(url));
const isDirectFile = (url) => !isStreamLink(url) && DIRECT_FILE.test(pathOf(url));

function isValidUrl(url) {
  try {
    const stripped = url.replace(/^[a-z-]+:(?=https?:)/i, '');
    const parsed = new URL(stripped);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function applyMode(url, mode) {
  const p = MODE_PREFIX[mode];
  if (!p) return url;
  if (/^(generic:|g:|r:|ytdl:|[a-z-]+:https?:)/i.test(url)) return url; // already prefixed
  return p + url;
}

export default function Dashboard() {
  const { t } = useI18n();
  const { active, queueView, createJobs } = useJobs();
  const { settings: s } = useSettings();
  const [text, setText] = useState('');
  const [mode, setMode] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { url, options }
  const [quality, setQuality] = useState('best'); // YouTube only
  const [format, setFormat] = useState('mp4');  // YouTube only: mp4 | mp3
  const [presets, setPresets] = useState([]);
  const [preset, setPreset] = useState('none');
  const urlInputId = useId();

  useEffect(() => { presetsApi.list().then(setPresets).catch(() => {}); }, []);

  const urls = useMemo(() => splitUrls(text), [text]);
  // "video" mode is exactly FOR sites with a dedicated extractor that still
  // can't grab the video - the mismatch warning below would be actively
  // wrong for it, not just unnecessary.
  const modeMismatch = mode !== 'auto' && mode !== 'video' && urls.some(hasDedicatedExtractor);
  const hasInvalidUrl = urls.length > 0 && !urls.every(isValidUrl);
  const allYoutube = urls.length > 0 && urls.every(isYoutubeUrl);
  const directCount = urls.filter(isDirectFile).length;
  const streamCount = urls.filter(isStreamLink).length;
  const jobOptions = () => {
    const o = {};
    if (s?.default_range?.trim()) o.range = s.default_range.trim();
    if (allYoutube) {
      // quality is a video-resolution filter; it does nothing once yt-dlp is
      // extracting audio only, so it's dropped along with hiding the select.
      if (format !== 'mp3' && quality !== 'best') o.quality = quality;
      if (format && format !== 'mp4') o.format = format;
    }
    // allYoutube guard here too, not just on hiding the select: the picked
    // value otherwise lingers in state and would still get attached (to no
    // effect) if the user pastes a YouTube URL after choosing a preset.
    if (preset !== 'none' && !allYoutube) o.preset_id = preset;
    return Object.keys(o).length ? o : undefined;
  };

  useEffect(() => {
    if (isElectron) window.electronAPI.setTrayBadge(active.length);
  }, [active.length]);

  const appendText = (chunk) => {
    const c = (chunk || '').trim();
    if (!c) return;
    setText(prev => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n${c}` : c));
  };

  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip?.trim()) return;
      appendText(clip);
    } catch {
      toast.error(t('dashboard.pasteFailed'));
    }
  };

  const [dragging, setDragging] = useState(false);
  const onDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const dt = e.dataTransfer;
    const txtFiles = [...(dt.files || [])].filter(f => /\.(txt|csv|md)$/i.test(f.name));
    if (txtFiles.length) {
      for (const f of txtFiles) {
        try { appendText(await f.text()); } catch { /* ignore */ }
      }
      return;
    }
    const t2 = dt.getData('text/uri-list') || dt.getData('text/plain');
    if (t2) appendText(t2);
  };

  const [watching, setWatching] = useState(false);
  const watchCurrent = async () => {
    if (!isValidUrl(urls[0])) { toast.error(t('dashboard.invalidUrl')); return; }
    setWatching(true);
    try {
      await watchesApi.create(applyMode(urls[0], mode), 60, jobOptions());
      toast.success(t('watch.added'));
    } catch {
      toast.error(t('watch.addFailed'));
    } finally {
      setWatching(false);
    }
  };

  const submit = async (list, submitMode = mode, opts = jobOptions()) => {
    if (!list.length) return;
    if (!list.every(isValidUrl)) {
      toast.error(t('dashboard.invalidUrl'));
      return;
    }
    setBusy(true);
    try {
      // A stream playlist goes to the video engine with its own site as the referer, the same as a
      // stream the extension finds; everything else goes through as one batch.
      const streams = list.filter(isStreamLink);
      const rest = list.filter(u => !isStreamLink(u));
      const created = rest.length ? await createJobs(rest.map(u => applyMode(u, submitMode)), opts) : [];
      for (const u of streams) {
        let referer = '';
        try { referer = `${new URL(pathOf(u)).origin}/`; } catch { /* validated above */ }
        created.push(...await createJobs([u], { ...(opts || {}), ...(referer ? { referer } : {}) }));
      }
      toast.success(t('dashboard.added', { count: created.length, s: created.length === 1 ? '' : 's' }));
      setText('');
    } catch {
      toast.error(t('dashboard.addFailed'));
    } finally {
      setBusy(false);
    }
  };

  const running = queueView.filter(j => j.status === 'running').length;
  const waiting = queueView.filter(j => j.status === 'queued').length;
  // Compact select that looks like a toolbar chip instead of a form field.
  const chipSelect = 'h-7 w-auto gap-1.5 border-0 bg-transparent px-2.5 text-xs font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus:ring-2';

  const canSingle = !busy && urls.length === 1 && !isYoutubeUrl(urls[0]);

  return (
    <div className="space-y-9">
      <PageSubtitle>
        {[running > 0 && `${running} ${t('dashboard.status.running').toLowerCase()}`, waiting > 0 && `${waiting} ${t('dashboard.status.queued').toLowerCase()}`].filter(Boolean).join(' · ')}
      </PageSubtitle>

      {/* Composer: the link, and everything that shapes the download, on one surface */}
      <section aria-label={t('dashboard.inputLabel')}>
        <div
          className={`rounded-xl border bg-card transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 ${dragging ? 'border-ring ring-2 ring-ring/20' : 'border-border'}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="flex items-start gap-2 p-2.5">
            <div className="relative flex-1 min-w-0">
              <Link2 className="w-4 h-4 absolute start-3 top-[13px] text-muted-foreground pointer-events-none" aria-hidden="true" />
              <label htmlFor={urlInputId} className="sr-only">{t('dashboard.inputLabel')}</label>
              <Textarea
                id={urlInputId}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={t('dashboard.urlPlaceholder')}
                rows={Math.min(6, Math.max(1, urls.length || 1))}
                className="font-mono text-[13px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 ps-10 pe-2 py-2.5 min-h-10"
                data-testid="url-input"
                onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(urls); }}
              />
            </div>
            {!text && (
              <Button
                variant="ghost" size="sm" onClick={paste} data-testid="paste-btn"
                className="h-10 px-3 text-muted-foreground hover:text-foreground"
              >
                <ClipboardPaste className="w-4 h-4 me-1.5" aria-hidden="true" /> {t('dashboard.paste')}
              </Button>
            )}
            <Button
              className="h-10 px-5" onClick={() => submit(urls)} disabled={busy || !urls.length}
              title="Ctrl + Enter" data-testid="download-btn"
            >
              {busy ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <ArrowDownToLine className="w-4 h-4 me-2" aria-hidden="true" />}
              {t('dashboard.add')}{urls.length > 1 ? ` (${urls.length})` : ''}
            </Button>
          </div>

          <div className="flex items-center gap-0.5 flex-wrap px-2.5 pb-2.5">
            <Popover>
              <PopoverTrigger asChild>
                <Chip icon={Folder} aria-label={t('settings.outputDir')} title={s?.output_dir || ''}>
                  <span className="max-w-[200px] truncate">{folderTail(s?.output_dir) || t('settings.outputDir')}</span>
                  <ChevronDown className="w-3 h-3 opacity-60" aria-hidden="true" />
                </Chip>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-4">
                <OutputFields />
              </PopoverContent>
            </Popover>

            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className={chipSelect} data-testid="mode-select" aria-label={t('dashboard.inputLabel')}><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODES.map(m => <SelectItem key={m} value={m}>{t(`dashboard.mode.${m}`)}</SelectItem>)}
              </SelectContent>
            </Select>

            {presets.length > 0 && !allYoutube && (
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className={chipSelect} data-testid="preset-select" aria-label={t('dashboard.noPreset')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('dashboard.noPreset')}</SelectItem>
                  {presets.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {allYoutube && (
              <>
                {format !== 'mp3' && (
                  <Select value={quality} onValueChange={setQuality}>
                    <SelectTrigger className={chipSelect} data-testid="yt-quality" aria-label={t('dashboard.quality.best')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['best', '1080', '720', '480', '360'].map(q => (
                        <SelectItem key={q} value={q}>{t(`dashboard.quality.${q}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger className={chipSelect} data-testid="yt-format" aria-label={t('dashboard.format.mp4')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mp4">{t('dashboard.format.mp4')}</SelectItem>
                    <SelectItem value="mp3">{t('dashboard.format.mp3')}</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}

            <div className="ms-auto flex items-center gap-0.5">
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (!isValidUrl(urls[0])) { toast.error(t('dashboard.invalidUrl')); return; }
                  setPreview({ url: applyMode(urls[0], mode), options: jobOptions() });
                }}
                disabled={!canSingle}
                title={t('dashboard.preview')} aria-label={t('dashboard.preview')}
                data-testid="preview-btn"
              >
                <Eye className="w-4 h-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={watchCurrent}
                disabled={!canSingle || watching}
                title={t('watch.add')} aria-label={t('watch.add')}
                data-testid="watch-btn"
              >
                {watching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </div>

        {hasInvalidUrl && (
          <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            {t('dashboard.invalidUrl')}
          </p>
        )}
        {(directCount > 0 || streamCount > 0) && (
          <p className="mt-2.5 flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="link-kind-hint">
            {streamCount > 0
              ? <Waves className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              : <FileCheck2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
            <span>
              {directCount > 0 && t('dashboard.directFile', { count: directCount })}
              {directCount > 0 && streamCount > 0 && ' '}
              {streamCount > 0 && t('dashboard.streamLink', { count: streamCount })}
            </span>
          </p>
        )}
        {modeMismatch && (
          <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            {t('dashboard.modeMismatch')}
          </p>
        )}
      </section>

      {queueView.length > 0 && (
        <section aria-label={t('dashboard.queue')} className="space-y-2">
          <div className="flex items-baseline gap-2 px-3">
            <h2 className="text-[13px] font-semibold">{t('dashboard.queue')}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{queueView.length}</span>
          </div>
          <div className="list">
            <AnimatePresence initial={false}>
              {queueView.map(job => (
                <motion.div
                  key={job.id}
                  layout
                  initial={listItem.initial}
                  animate={listItem.animate}
                  exit={listItem.exit}
                  transition={snappy}
                >
                  <JobCard job={job} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      <PreviewDialog
        url={preview?.url}
        options={preview?.options}
        open={!!preview}
        onOpenChange={o => !o && setPreview(null)}
        onConfirm={(u, count, rangeOverride) => submit([u], mode, {
          ...preview?.options,
          total: count,
          ...(rangeOverride ? { range: rangeOverride } : {}),
        })}
      />
    </div>
  );
}
