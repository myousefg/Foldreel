import { useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight, Check, FolderOpen, Image as ImageIcon, Loader2, Plus, Trash2, Video, X, ArrowLeftRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PageActions } from '@/components/PageHeader';
import { StatusBadge } from '@/components/kit';
import { useI18n } from '@/context/I18nProvider';
import { useConversions } from '@/lib/convert';
import { isElectron } from '@/lib/electron';
import { sortPathsByName } from '@/lib/utils';
import { organizeThumbUrl } from '@/lib/api';

const PHOTO_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'heic', 'heif', 'avif', 'tif', 'tiff']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'flv', 'wmv', 'mpg', 'mpeg', '3gp', 'ogv', 'hevc']);
const PHOTO_TARGETS = ['jpg', 'png', 'webp'];
const VIDEO_TARGETS = ['mp4', 'webm', 'gif'];
// A video can also become a still picture (one frame). Instagram/TikTok photo
// posts often download as a one-frame or slideshow video.
const FRAME_TARGETS = ['jpg', 'png', 'webp'];
const QUALITIES = ['high', 'medium', 'low'];
const GIF_FPS = [10, 15, 24, 30];
const GIF_WIDTH = [240, 320, 480, 640];

function extOf(path) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(path || '');
  return m ? m[1].toLowerCase() : '';
}
function kindOf(path) {
  const e = extOf(path);
  if (PHOTO_EXT.has(e)) return 'photo';
  if (VIDEO_EXT.has(e)) return 'video';
  return null;
}
function baseName(path) {
  return (path || '').split(/[\\/]/).pop();
}
function humanSize(n) {
  if (!n) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

// Quality only means something for lossy outputs. PNG is lossless and GIF is controlled by
// frame rate and width, so the quality choice is hidden for them instead of doing nothing.
const hasQuality = (kind, target) => target !== 'png' && target !== 'gif' && (kind === 'photo' || kind === 'video');

const selectBase = 'h-8 text-xs';

function QualitySelect({ value, onChange, className = 'w-28', label }) {
  const { t } = useI18n();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`${selectBase} ${className}`} aria-label={label || t('convert.qualityName')} title={t('convert.qualityName')}><SelectValue>{t(`convert.quality.${value}`)}</SelectValue></SelectTrigger>
      <SelectContent>
        {QUALITIES.map(q => (
          <SelectItem key={q} value={q}>
            <span className="block">{t(`convert.quality.${q}`)}</span>
            <span className="block text-[11px] text-muted-foreground">{t(`convert.qualityHint.${q}`)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Target picker for videos: the video formats, then the "save one frame" ones.
function VideoTargetItems() {
  const { t } = useI18n();
  return (
    <>
      <SelectGroup>
        <SelectLabel>{t('convert.group.video')}</SelectLabel>
        {VIDEO_TARGETS.map(f => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}
      </SelectGroup>
      <SelectGroup>
        <SelectLabel>{t('convert.group.frame')}</SelectLabel>
        {FRAME_TARGETS.map(f => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}
      </SelectGroup>
    </>
  );
}

function Thumb({ path, kind, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const FallbackIcon = kind === 'video' ? Video : ImageIcon;
  return (
    <span className="shrink-0 rounded-md bg-muted flex items-center justify-center overflow-hidden ring-1 ring-inset ring-border" style={{ width: size, height: size }}>
      {failed
        ? <FallbackIcon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        : <img src={organizeThumbUrl(path)} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />}
    </span>
  );
}

function StagedRow({ item, onChangeTarget, onChangeField, onRemove }) {
  const { t } = useI18n();
  const isVideo = item.kind === 'video';
  const isGif = item.target === 'gif';
  const isFrame = isVideo && FRAME_TARGETS.includes(item.target);
  return (
    <div className="px-3 py-2.5" data-testid="staged-row">
      <div className="flex items-center gap-3">
        <Thumb path={item.path} kind={item.kind} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] truncate" title={item.path}>{baseName(item.path)}</p>
          <p className="text-[11px] text-muted-foreground uppercase">{extOf(item.path)}</p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        <Select value={item.target} onValueChange={v => onChangeTarget(item.id, v)}>
          <SelectTrigger className={`${selectBase} w-24`} aria-label={t('convert.target')}><SelectValue /></SelectTrigger>
          <SelectContent>
            {isVideo
              ? <VideoTargetItems />
              : PHOTO_TARGETS.map(f => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => onRemove(item.id)} title={t('convert.remove')} aria-label={t('convert.remove')}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      {isFrame && (
        <div className="flex items-center gap-2 ps-[52px] pt-2">
          <label htmlFor={`frame-at-${item.id}`} className="text-[11px] text-muted-foreground">{t('convert.frameAt')}</label>
          <Input
            id={`frame-at-${item.id}`} type="number" min="0" step="0.5" value={item.start ?? 0}
            onChange={e => onChangeField(item.id, 'start', e.target.value)}
            className="w-20 h-7 text-xs" data-testid={`frame-at-${item.id}`}
          />
        </div>
      )}
      {isGif && (
        <div className="flex items-center gap-2 flex-wrap ps-[52px] pt-2">
          <span className="text-[11px] text-muted-foreground">{t('convert.gif.fps')}</span>
          <Select value={String(item.fps ?? 15)} onValueChange={v => onChangeField(item.id, 'fps', Number(v))}>
            <SelectTrigger className="w-16 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{GIF_FPS.map(f => <SelectItem key={f} value={String(f)}>{f}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground ms-1">{t('convert.gif.width')}</span>
          <Select value={String(item.width ?? 480)} onValueChange={v => onChangeField(item.id, 'width', Number(v))}>
            <SelectTrigger className="w-20 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{GIF_WIDTH.map(w => <SelectItem key={w} value={String(w)}>{w}px</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground ms-1">{t('convert.gif.start')}</span>
          <Input
            type="number" min="0" step="0.5" value={item.start ?? 0}
            onChange={e => onChangeField(item.id, 'start', e.target.value)}
            className="w-16 h-7 text-xs" data-testid={`gif-start-${item.id}`}
          />
          <span className="text-[11px] text-muted-foreground ms-1">{t('convert.gif.end')}</span>
          <Input
            type="number" min="0" step="0.5" placeholder={t('convert.gif.endPlaceholder')}
            value={item.end ?? ''} onChange={e => onChangeField(item.id, 'end', e.target.value)}
            className="w-20 h-7 text-xs" data-testid={`gif-end-${item.id}`}
          />
        </div>
      )}
    </div>
  );
}

function ConversionRow({ c, onRemove }) {
  const { t } = useI18n();
  return (
    <div className="group row-hover flex items-center gap-3 px-3 py-2.5" data-testid={`convert-${c.id}`}>
      <Thumb path={c.src_path} kind={c.kind} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] truncate" title={c.src_name}>{c.src_name}</p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 tabular-nums">
          <span className="uppercase">{extOf(c.src_name)}</span>
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
          <span className="uppercase text-foreground">{c.target}</span>
          {c.status === 'done' && c.dest_size > 0 && (
            <span>· {humanSize(c.src_size)} → <span className="text-foreground">{humanSize(c.dest_size)}</span></span>
          )}
        </p>
      </div>
      {c.status === 'error' && (
        <p className="text-[11px] text-destructive max-w-[240px] truncate" title={c.error_text}>{c.error_text}</p>
      )}
      <StatusBadge status={c.status === 'running' ? 'running' : c.status} className="w-24 shrink-0">
        {c.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
        {c.status === 'done' && <Check className="w-3 h-3" aria-hidden="true" />}
        {t(`convert.status.${c.status}`)}
      </StatusBadge>
      <div className="flex items-center shrink-0">
        {c.status === 'done' && isElectron && (
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" title={t('convert.reveal')} aria-label={t('convert.reveal')}
            onClick={() => window.electronAPI.showInFolder(c.dest_path)}>
            <FolderOpen className="w-4 h-4" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
          title={t('convert.remove')} aria-label={t('convert.remove')} onClick={() => onRemove(c.id)}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Convert() {
  const { t } = useI18n();
  const { conversions, add, remove, clearFinished } = useConversions();
  const [staged, setStaged] = useState([]);
  const [photoTarget, setPhotoTargetState] = useState('jpg');
  const [photoQuality, setPhotoQualityState] = useState('high');
  const [videoTarget, setVideoTargetState] = useState('mp4');
  const [videoQuality, setVideoQualityState] = useState('high');

  // The selectors above the list read as "set this for every file", so a file that
  // is already staged picks up the change too instead of keeping its drop-time value.
  const setPhotoTarget = (v) => { setPhotoTargetState(v); setStaged(prev => prev.map(i => (i.kind === 'photo' ? { ...i, target: v } : i))); };
  const setPhotoQuality = (v) => { setPhotoQualityState(v); setStaged(prev => prev.map(i => (i.kind === 'photo' ? { ...i, quality: v } : i))); };
  const setVideoTarget = (v) => { setVideoTargetState(v); setStaged(prev => prev.map(i => (i.kind === 'video' ? { ...i, target: v } : i))); };
  const setVideoQuality = (v) => { setVideoQualityState(v); setStaged(prev => prev.map(i => (i.kind === 'video' ? { ...i, quality: v } : i))); };
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const stageFiles = (paths) => {
    let skipped = 0;
    const items = [];
    for (const p of sortPathsByName(paths)) {
      const kind = kindOf(p);
      if (!kind) { skipped += 1; continue; }
      items.push({
        id: `${Date.now()}_${items.length}_${Math.random().toString(36).slice(2, 7)}`,
        path: p,
        kind,
        target: kind === 'photo' ? photoTarget : videoTarget,
        quality: kind === 'photo' ? photoQuality : videoQuality,
        // Only read when target is (or becomes) 'gif' - harmless otherwise.
        fps: 15,
        width: 480,
        start: 0,
        end: '',
      });
    }
    if (items.length) setStaged(prev => [...prev, ...items]);
    if (skipped > 0) toast.error(t('convert.unsupported', { name: `${skipped} file${skipped === 1 ? '' : 's'}` }));
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    if (!isElectron) return;
    const files = [...(e.dataTransfer?.files || [])];
    const paths = [];
    for (const f of files) {
      try {
        const p = await window.electronAPI.getPathForFile(f);
        if (p) paths.push(p);
      } catch { /* ignore */ }
    }
    stageFiles(paths);
  };

  const browse = async () => {
    if (!isElectron) return;
    const paths = await window.electronAPI.selectFiles({ title: t('convert.browse') });
    stageFiles(paths || []);
  };

  const changeTarget = (id, target) => setStaged(prev => prev.map(i => (i.id === id ? { ...i, target } : i)));
  const changeField = (id, field, value) => setStaged(prev => prev.map(i => (i.id === id ? { ...i, [field]: value } : i)));
  const removeStaged = (id) => setStaged(prev => prev.filter(i => i.id !== id));

  const convertAll = async () => {
    if (!staged.length) return;
    setBusy(true);
    try {
      await add(staged.map(i => ({
        path: i.path, target: i.target, quality: i.quality,
        ...(i.target === 'gif' ? {
          fps: i.fps, width: i.width,
          start: Number(i.start) || 0,
          end: i.end === '' || i.end == null ? undefined : Number(i.end),
        } : {}),
        ...(i.kind === 'video' && FRAME_TARGETS.includes(i.target) ? { start: Number(i.start) || 0 } : {}),
      })));
      setStaged([]);
    } catch {
      toast.error(t('convert.addFailed'));
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (id) => {
    try { await remove(id); } catch { /* already gone */ }
  };

  const finishedCount = conversions.filter(c => c.status === 'done' || c.status === 'error').length;
  const photos = staged.filter(i => i.kind === 'photo').length;
  const videos = staged.length - photos;

  return (
    <div
      className="space-y-8"
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <PageActions>
        {staged.length > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground" onClick={() => setStaged([])} data-testid="convert-clear-btn">
            <X className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('convert.clearAll')}
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8" onClick={browse} disabled={!isElectron} data-testid="convert-browse-btn">
          <Plus className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('convert.browse')}
        </Button>
        {staged.length > 0 && (
          <Button size="sm" className="h-8" onClick={convertAll} disabled={busy} data-testid="convert-all-btn">
            {busy ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />}
            {t('convert.convertAll', { count: staged.length })}
          </Button>
        )}
      </PageActions>

      {staged.length === 0 ? (
        <button
          type="button" onClick={browse} disabled={!isElectron}
          className={`w-full rounded-xl border border-dashed py-14 flex flex-col items-center gap-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dragging ? 'border-ring bg-accent/40' : 'border-border'}`}
        >
          <span className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <ArrowLeftRight className="w-[18px] h-[18px] text-muted-foreground" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium">{t('convert.dropTitle')}</span>
        </button>
      ) : (
        <section aria-label={t('convert.photosTo')} className="space-y-3">
          {/* Applies to every file of that kind; each row can still override it */}
          <div className="flex items-center gap-x-6 gap-y-2 flex-wrap px-3">
            {photos > 0 && (
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs text-muted-foreground tabular-nums">{photos}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                <Select value={photoTarget} onValueChange={setPhotoTarget}>
                  <SelectTrigger className={`${selectBase} w-24`} aria-label={t('convert.photosTo')}><SelectValue /></SelectTrigger>
                  <SelectContent>{PHOTO_TARGETS.map(f => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}</SelectContent>
                </Select>
                {hasQuality('photo', photoTarget) && <QualitySelect value={photoQuality} onChange={setPhotoQuality} />}
              </div>
            )}
            {videos > 0 && (
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs text-muted-foreground tabular-nums">{videos}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                <Select value={videoTarget} onValueChange={setVideoTarget}>
                  <SelectTrigger className={`${selectBase} w-24`} aria-label={t('convert.videosTo')}><SelectValue /></SelectTrigger>
                  <SelectContent><VideoTargetItems /></SelectContent>
                </Select>
                {hasQuality('video', videoTarget) && <QualitySelect value={videoQuality} onChange={setVideoQuality} />}
              </div>
            )}
          </div>
          <div className="list">
            {staged.map(item => (
              <StagedRow key={item.id} item={item} onChangeTarget={changeTarget} onChangeField={changeField} onRemove={removeStaged} />
            ))}
          </div>
        </section>
      )}

      {conversions.length > 0 && (
        <section aria-label={t('convert.converted')} className="space-y-2">
          <div className="flex items-center justify-between px-3">
            <h2 className="text-[13px] font-semibold">{t('convert.converted')}</h2>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={clearFinished} disabled={!finishedCount}>
              {t('convert.clearFinished')}
            </Button>
          </div>
          <div className="list">
            {conversions.map(c => <ConversionRow key={c.id} c={c} onRemove={doRemove} />)}
          </div>
        </section>
      )}
    </div>
  );
}
