import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Camera, ChevronDown, Crop, FileVideo, FolderOpen, Gauge, ImagePlus, Keyboard, Loader2, Music, Pause, Play, Redo2, Repeat,
  RotateCw, Save, Scissors, SkipBack, SkipForward, SlidersHorizontal, StepBack, StepForward, Type, Undo2, Volume2, Wand2, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { PageActions } from '@/components/PageHeader';
import DropOverlay from '@/components/DropOverlay';
import CropBox from '@/components/edit/CropBox';
import TextLayer from '@/components/edit/TextLayer';
import ToneDefs from '@/components/edit/ToneDefs';
import Timeline from '@/components/edit/Timeline';
import { CropPanel, RotatePanel, LooksPanel, AdjustPanel, TextPanel, SpeedPanel, AudioPanel } from '@/components/edit/Panels';
import { useI18n } from '@/context/I18nProvider';
import { editApi, mediaUrl, organizeThumbUrl } from '@/lib/api';
import { isElectron } from '@/lib/electron';
import { handoff } from '@/lib/handoff';
import {
  SIZES, clamp, cssFilter, cssTransform, fadeOpacity, formatOptions, formatTime, isEdited, outputSize, resultLength, toExportOps, turnedSize,
} from '@/lib/editOps';
import { useEditOps } from '@/lib/useEditOps';

const TOOLS = {
  image: ['crop', 'rotate', 'looks', 'adjust', 'text'],
  video: ['crop', 'rotate', 'looks', 'adjust', 'text', 'speed', 'audio'],
  audio: ['speed', 'audio'],
};
const TOOL_ICON = { crop: Crop, rotate: RotateCw, looks: Wand2, adjust: SlidersHorizontal, text: Type, speed: Gauge, audio: Volume2 };
const SHORTCUTS = [
  ['Space', 'edit.keys.play'], ['← →', 'edit.keys.step'], ['Shift + ← →', 'edit.keys.step1s'], [', .', 'edit.keys.frame'],
  ['I / O', 'edit.keys.inout'], ['Home / End', 'edit.keys.jump'], ['L', 'edit.keys.loop'], ['Ctrl + Z', 'edit.keys.undo'],
];

export default function Edit() {
  const { t } = useI18n();
  const { ops, set, undo, redo, reset, canUndo, canRedo } = useEditOps();
  const [path, setPath] = useState('');
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tool, setTool] = useState('crop');
  const [aspect, setAspect] = useState('free');
  const [selText, setSelText] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [stage, setStage] = useState({ w: 800, h: 450 });
  const [job, setJob] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const stageRef = useRef(null);
  const mediaRef = useRef(null);
  const opsRef = useRef(ops);
  opsRef.current = ops;
  const loopRef = useRef(loop);
  loopRef.current = loop;

  // ── opening a file ──────────────────────────────────────────────────────────
  const load = useCallback(async (p) => {
    if (!p) return;
    setLoading(true);
    try {
      const i = await editApi.info(p);
      setPath(p); setInfo(i); setTime(0); setPlaying(false); setPreviewFailed(false); setJob(null); setZoom(1);
      reset(false);
      setAspect('free'); setSelText(0);
      setTool(TOOLS[i.kind][0]);
    } catch (e) {
      toast.error(e?.response?.status === 404 ? t('edit.notMedia') : t('edit.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [reset, t]);

  useEffect(() => {
    const sent = handoff.take('edit');
    if (sent?.length) load(sent[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const browse = async () => {
    if (!isElectron) return;
    const paths = await window.electronAPI.selectFiles({ title: t('edit.choose'), properties: ['openFile'] });
    if (paths?.length) load(paths[0]);
  };

  const onDrop = async (e) => {
    e.preventDefault();
    if (!isElectron) return;
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    try { const p = await window.electronAPI.getPathForFile(f); if (p) load(p); } catch { /* ignore */ }
  };

  // ── the stage ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [info]);

  const kind = info?.kind || 'video';
  const duration = info?.duration || 0;
  const start = ops.trimStart;
  const end = ops.trimEnd == null ? duration : Math.min(ops.trimEnd, duration);
  const turned = info && info.width ? turnedSize(info, ops) : { w: 16, h: 9 };
  const scale = info && info.width ? Math.min(Math.max(stage.w - 48, 50) / turned.w, Math.max(stage.h - 48, 50) / turned.h, 4) : 1;
  const frame = { w: turned.w * scale, h: turned.h * scale };
  const fps = info?.fps > 0 ? info.fps : 25;

  // ── playback ────────────────────────────────────────────────────────────────
  const seek = useCallback((sec) => {
    const m = mediaRef.current;
    if (m) m.currentTime = sec;
    setTime(sec);
  }, []);

  useEffect(() => {
    const m = mediaRef.current;
    if (!m) return;
    m.playbackRate = ops.speed;
    m.volume = clamp(ops.volume, 0, 1);
    m.muted = ops.mute;
  }, [ops.speed, ops.volume, ops.mute, info]);

  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    const tick = () => {
      const m = mediaRef.current;
      if (m) {
        const o = opsRef.current;
        const stop = o.trimEnd == null ? m.duration || 0 : o.trimEnd;
        if (m.currentTime >= stop - 0.03) {
          if (loopRef.current) { m.currentTime = o.trimStart; setTime(o.trimStart); raf = requestAnimationFrame(tick); return; }
          m.pause(); setPlaying(false); seek(o.trimStart); return;
        }
        setTime(m.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, seek]);

  const togglePlay = useCallback(() => {
    const m = mediaRef.current;
    if (!m) return;
    if (!m.paused) { m.pause(); setPlaying(false); return; }
    const o = opsRef.current;
    const stop = o.trimEnd == null ? m.duration || 0 : o.trimEnd;
    if (m.currentTime >= stop - 0.05 || m.currentTime < o.trimStart) seek(o.trimStart);
    m.play().then(() => setPlaying(true)).catch(() => setPreviewFailed(true));
  }, [seek]);

  // ── keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!info) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [role="slider"], [role="combobox"], [contenteditable], [role="dialog"]')) return;
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (ctrl && k === 'y') { e.preventDefault(); redo(); return; }
      if (kind === 'image' || ctrl) return;
      if (k === ' ') { e.preventDefault(); togglePlay(); }
      else if (k === 'arrowleft' || k === 'arrowright') {
        e.preventDefault();
        seek(clamp(time + (k === 'arrowleft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1), start, end));
      } else if (k === ',' || k === '.') { seek(clamp(time + (k === ',' ? -1 : 1) / fps, start, end)); }
      else if (k === 'i') { set({ trimStart: clamp(time, 0, end - 0.1) }); }
      else if (k === 'o') { set({ trimEnd: clamp(time, start + 0.1, duration) }); }
      else if (k === 'l') { setLoop((v) => !v); }
      else if (k === 'home') seek(start);
      else if (k === 'end') seek(end);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [info, kind, time, start, end, duration, fps, togglePlay, seek, set, undo, redo]);

  // ── saving a copy ───────────────────────────────────────────────────────────
  const running = job?.status === 'running';
  const startExport = async (extra = {}) => {
    try {
      const j = await editApi.export(path, { ...toExportOps(ops, info), ...extra });
      setJob({ ...j, status: 'running', pct: 0 });
      setExportOpen(false);
    } catch (e) {
      toast.error(t('edit.export.failed', { error: e?.response?.data?.detail || '' }));
    }
  };
  const saveFrame = () => startExport({ frame_at: time, format: ops.format === 'jpg' || ops.format === 'webp' ? ops.format : 'png', trim_start: 0, trim_end: null, speed: 1, v_fade_in: 0, v_fade_out: 0 });
  useEffect(() => {
    if (!job || job.status !== 'running') return undefined;
    const id = setInterval(async () => {
      try {
        const s = await editApi.status(job.id);
        setJob((cur) => (cur && cur.id === s.id ? s : cur));
        if (s.status === 'done') toast.success(t('edit.export.done', { name: s.out_name }));
        else if (s.status === 'error') toast.error(t('edit.export.failed', { error: s.error }));
      } catch { setJob(null); }
    }, 500);
    return () => clearInterval(id);
  }, [job, t]);
  const cancelExport = () => { if (job) editApi.cancel(job.id).then(setJob).catch(() => {}); };

  const length = info ? resultLength(info, ops) : 0;
  const out = info ? outputSize(info, ops) : { w: 0, h: 0 };
  const poster = path ? organizeThumbUrl(path, 320) : '';
  const filmUrl = useMemo(() => (info?.kind === 'video' ? editApi.filmstripUrl(path, Math.min(40, 14 * Math.ceil(zoom)), 56) : ''), [info, path, zoom]);
  const waveUrl = useMemo(() => (info?.has_audio ? editApi.waveformUrl(path, 1400, info.kind === 'audio' ? 80 : 40) : ''), [info, path]);

  // ── nothing open yet ────────────────────────────────────────────────────────
  if (!info) {
    return (
      <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} data-testid="edit-empty">
        <DropOverlay />
        <div className="w-full rounded-xl border border-dashed border-border py-24 flex flex-col items-center gap-4 text-center">
          <span className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            {loading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-hidden="true" /> : <Scissors className="w-5 h-5 text-muted-foreground" aria-hidden="true" />}
          </span>
          <p className="text-sm font-medium">{t('edit.empty')}</p>
          <Button onClick={browse} disabled={!isElectron || loading} data-testid="edit-choose">
            <ImagePlus className="w-4 h-4 me-2" aria-hidden="true" /> {t('edit.choose')}
          </Button>
        </div>
      </div>
    );
  }

  const tools = TOOLS[kind];
  const panels = {
    crop: <CropPanel info={info} ops={ops} set={set} aspect={aspect} setAspect={setAspect} t={t} />,
    rotate: <RotatePanel ops={ops} set={set} t={t} />,
    looks: <LooksPanel ops={ops} set={set} poster={poster} t={t} />,
    adjust: <AdjustPanel kind={kind} ops={ops} set={set} t={t} />,
    text: <TextPanel ops={ops} set={set} sel={Math.min(selText, Math.max(0, ops.texts.length - 1))} setSel={setSelText} t={t} />,
    speed: <SpeedPanel ops={ops} set={set} t={t} />,
    audio: <AudioPanel info={info} ops={ops} set={set} t={t} />,
  };
  const cropRatio = aspect === 'free' || aspect === 'original' ? null
    : (() => { const [a, b] = aspect.split(':').map(Number); return a / b; })();
  const mediaStyle = {
    position: 'absolute', left: '50%', top: '50%', width: info.width * scale, height: info.height * scale,
    transform: cssTransform(ops), filter: cssFilter(ops), maxWidth: 'none',
    opacity: kind === 'video' ? fadeOpacity(time, ops, info) : 1,
  };
  const formats = formatOptions(kind);
  const stillOut = kind === 'image' || ['jpg', 'png', 'webp'].includes(ops.format);

  return (
    <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 7.25rem)' }} onDragOver={(e) => e.preventDefault()} onDrop={onDrop} data-testid="edit-page">
      <ToneDefs />
      <DropOverlay />
      <PageActions>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!canUndo} title={`${t('edit.undo')} (Ctrl+Z)`} aria-label={t('edit.undo')} data-testid="edit-undo"><Undo2 className="w-4 h-4" aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!canRedo} title={`${t('edit.redo')} (Ctrl+Shift+Z)`} aria-label={t('edit.redo')} data-testid="edit-redo"><Redo2 className="w-4 h-4" aria-hidden="true" /></Button>
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground" onClick={() => { reset(true); setAspect('free'); }} disabled={!isEdited(ops, info)} data-testid="edit-reset">{t('edit.resetAll')}</Button>
        <Button variant="outline" size="sm" className="h-8" onClick={browse} disabled={!isElectron || running}>{t('edit.change')}</Button>
      </PageActions>

      {/* file and save bar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {kind === 'audio' ? <Music className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" /> : kind === 'video' ? <FileVideo className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" /> : <ImagePlus className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />}
          <p className="text-sm font-medium truncate" title={path} data-testid="edit-filename">{info.name}</p>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {info.width ? `${info.width}×${info.height}` : ''}{info.duration ? ` · ${formatTime(info.duration)}` : ''}
          </span>
        </div>
        {running ? (
          <div className="flex items-center gap-2 w-72" role="status" data-testid="edit-progress">
            <Progress value={job.pct} className="h-2 flex-1" />
            <span className="text-xs tabular-nums w-9 text-end">{job.pct}%</span>
            <Button size="sm" variant="ghost" className="h-8" onClick={cancelExport}><X className="w-3.5 h-3.5 me-1" aria-hidden="true" />{t('common.cancel')}</Button>
          </div>
        ) : (
          <>
            {job?.status === 'done' && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="edit-saved">
                <span className="truncate max-w-[220px]" title={job.out_path}>{t('edit.export.done', { name: job.out_name })}</span>
                {isElectron && window.electronAPI.showInFolder && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.electronAPI.showInFolder(job.out_path)} title={t('library.showInFolder')} aria-label={t('library.showInFolder')}><FolderOpen className="w-3.5 h-3.5" /></Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => load(job.out_path)}>{t('edit.export.editCopy')}</Button>
              </div>
            )}
            <Popover open={exportOpen} onOpenChange={setExportOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" className="h-8" data-testid="edit-export-open"><Save className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('edit.export.save')}<ChevronDown className="w-3 h-3 ms-1.5 opacity-70" aria-hidden="true" /></Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3" data-testid="edit-export-panel">
                <div className="space-y-1.5">
                  <span className="text-xs font-medium">{t('edit.export.format')}</span>
                  <Select value={ops.format} onValueChange={(v) => set({ format: v })}>
                    <SelectTrigger className="h-9 text-sm" aria-label={t('edit.export.format')} data-testid="edit-format"><SelectValue /></SelectTrigger>
                    <SelectContent>{formats.map((f) => <SelectItem key={f} value={f}>{t(`edit.format.${f}`)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {kind !== 'audio' && ops.format !== 'mp3' && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium">{t('edit.export.size')}</span>
                    <Select value={String(ops.height ?? 'orig')} onValueChange={(v) => set({ height: v === 'orig' ? null : Number(v) })}>
                      <SelectTrigger className="h-9 text-sm" aria-label={t('edit.export.size')} data-testid="edit-size"><SelectValue /></SelectTrigger>
                      <SelectContent>{SIZES.map((h) => <SelectItem key={h ?? 'orig'} value={String(h ?? 'orig')}>{h ? `${h}p` : t('edit.size.orig')}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {ops.format !== 'png' && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium">{t('edit.export.quality')}</span>
                    <Select value={ops.quality} onValueChange={(v) => set({ quality: v })}>
                      <SelectTrigger className="h-9 text-sm" aria-label={t('edit.export.quality')} data-testid="edit-quality"><SelectValue /></SelectTrigger>
                      <SelectContent>{['high', 'balanced', 'small'].map((q) => <SelectItem key={q} value={q}>{t(`edit.quality.${q}`)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <p className="text-xs text-muted-foreground tabular-nums" data-testid="edit-summary">
                  {kind !== 'audio' && ops.format !== 'mp3' ? `${out.w} × ${out.h}` : ''}{!stillOut && length ? `${kind !== 'audio' && ops.format !== 'mp3' ? ' · ' : ''}${formatTime(length)}` : ''}
                </p>
                <Button className="w-full" onClick={() => startExport()} data-testid="edit-export"><Save className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('edit.export.save')}</Button>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        {/* tools */}
        <div className="w-[68px] shrink-0 flex flex-col gap-1" role="tablist" aria-orientation="vertical" aria-label={t('edit.toolsLabel')}>
          {tools.map((id) => {
            const Icon = TOOL_ICON[id];
            return (
              <button
                key={id} type="button" role="tab" aria-selected={tool === id} onClick={() => setTool(id)} data-testid={`tool-${id}`}
                className={`relative h-14 rounded-lg flex flex-col items-center justify-center gap-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  tool === id ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
              >
                {tool === id && <span className="absolute start-0 top-3 bottom-3 w-0.5 rounded bg-primary" aria-hidden="true" />}
                <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} aria-hidden="true" />
                {t(`edit.tools.${id}`)}
              </button>
            );
          })}
        </div>
        <div className="w-64 shrink-0 overflow-y-auto rounded-xl border border-border bg-card p-4" role="tabpanel" data-testid="edit-panel">{panels[tool]}</div>

        {/* preview */}
        <div ref={stageRef} className="relative flex-1 min-w-0 rounded-xl bg-black/50 ring-1 ring-inset ring-border overflow-hidden" data-testid="edit-stage">
          {kind === 'audio' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Music className="w-12 h-12" aria-hidden="true" />
              <audio ref={mediaRef} src={mediaUrl(path)} preload="auto" onError={() => setPreviewFailed(true)} onLoadedMetadata={() => seek(start)} />
            </div>
          ) : (
            <div className="absolute" style={{ left: (stage.w - frame.w) / 2, top: (stage.h - frame.h) / 2, width: frame.w, height: frame.h }} data-testid="edit-frame">
              <div className="absolute inset-0 overflow-hidden">
                {kind === 'video' ? (
                  <video
                    ref={mediaRef} src={mediaUrl(path)} poster={poster} preload="auto" playsInline style={mediaStyle}
                    onClick={togglePlay} onError={() => setPreviewFailed(true)}
                    onLoadedMetadata={() => seek(start)} data-testid="edit-video"
                  />
                ) : (
                  <img
                    src={mediaUrl(path)} alt={info.name} draggable={false} style={mediaStyle} data-testid="edit-image"
                    onError={(e) => { if (!e.currentTarget.dataset.fallback) { e.currentTarget.dataset.fallback = '1'; e.currentTarget.src = organizeThumbUrl(path, 1600); } }}
                  />
                )}
              </div>
              <TextLayer
                frame={frame} crop={ops.crop} texts={ops.texts} selected={Math.min(selText, ops.texts.length - 1)}
                interactive={tool === 'text'} onSelect={setSelText}
                onMove={(i, p) => set({ texts: ops.texts.map((x, k) => (k === i ? { ...x, ...p } : x)) })}
              />
              <CropBox frame={frame} crop={ops.crop} ratio={cropRatio} active={tool === 'crop'} onChange={(c) => set({ crop: c })} label={t('edit.tools.crop')} />
            </div>
          )}
          {previewFailed && kind !== 'image' && (
            <p className="absolute inset-x-4 bottom-3 rounded-md bg-black/70 px-3 py-2 text-xs text-white/90" role="alert">{t('edit.previewFailed')}</p>
          )}
          {info.width > 0 && (
            <span className="absolute end-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[11px] text-white/80 tabular-nums pointer-events-none" data-testid="edit-badge">{out.w}×{out.h}</span>
          )}
        </div>
      </div>

      {/* transport and timeline */}
      {kind !== 'image' && (
        <div className="shrink-0 rounded-xl border border-border bg-card px-4 py-3 space-y-2" data-testid="edit-bottom">
          <div className="flex items-center gap-1 text-xs">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => seek(start)} title={`${t('edit.keys.jump')} (Home)`} aria-label={t('edit.toStart')} data-testid="edit-to-start"><SkipBack className="w-4 h-4" aria-hidden="true" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => seek(clamp(time - 1 / fps, start, end))} title={`${t('edit.keys.frame')} (,)`} aria-label={t('edit.prevFrame')} data-testid="edit-prev-frame"><StepBack className="w-4 h-4" aria-hidden="true" /></Button>
            <Button size="icon" variant="secondary" className="h-9 w-9 rounded-full" onClick={togglePlay} aria-label={t(playing ? 'edit.pause' : 'edit.play')} data-testid="edit-play">
              {playing ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4 ms-0.5" aria-hidden="true" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => seek(clamp(time + 1 / fps, start, end))} title={`${t('edit.keys.frame')} (.)`} aria-label={t('edit.nextFrame')} data-testid="edit-next-frame"><StepForward className="w-4 h-4" aria-hidden="true" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => seek(end)} title={`${t('edit.keys.jump')} (End)`} aria-label={t('edit.toEnd')}><SkipForward className="w-4 h-4" aria-hidden="true" /></Button>
            <Button size="icon" variant={loop ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={() => setLoop((v) => !v)} aria-pressed={loop} title={`${t('edit.loop')} (L)`} aria-label={t('edit.loop')} data-testid="edit-loop"><Repeat className="w-4 h-4" aria-hidden="true" /></Button>
            <span className="ms-3 tabular-nums font-medium" data-testid="edit-time">{formatTime(time)}</span>
            <span className="text-muted-foreground tabular-nums ms-1">/ {formatTime(duration)}</span>
            <span className="mx-2 w-px h-4 bg-border" aria-hidden="true" />
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set({ trimStart: clamp(time, 0, end - 0.1) })} data-testid="edit-set-start">{t('edit.setStart')}</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set({ trimEnd: clamp(time, start + 0.1, duration) })} data-testid="edit-set-end">{t('edit.setEnd')}</Button>
            {kind === 'video' && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={saveFrame} disabled={running} data-testid="edit-save-frame" title={t('edit.saveFrame')}>
                <Camera className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('edit.saveFrame')}
              </Button>
            )}
            <span className="ms-auto text-muted-foreground tabular-nums me-3" data-testid="edit-kept">
              {t('edit.kept', { from: formatTime(start), to: formatTime(end), length: formatTime(length) })}
            </span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => clamp(z / 1.5, 1, 8))} disabled={zoom <= 1} aria-label={t('edit.zoomOut')} data-testid="edit-zoom-out"><ZoomOut className="w-4 h-4" aria-hidden="true" /></Button>
            <Slider className="w-24" min={1} max={8} step={0.25} value={[zoom]} onValueChange={([v]) => setZoom(v)} aria-label={t('edit.zoom')} />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => clamp(z * 1.5, 1, 8))} disabled={zoom >= 8} aria-label={t('edit.zoomIn')} data-testid="edit-zoom-in"><ZoomIn className="w-4 h-4" aria-hidden="true" /></Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t('edit.shortcuts')} title={t('edit.shortcuts')}><Keyboard className="w-4 h-4" aria-hidden="true" /></Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-1.5">
                {SHORTCUTS.map(([keys, label]) => (
                  <div key={keys} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{t(label)}</span>
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{keys}</kbd>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <Timeline info={{ ...info, path }} ops={ops} set={set} time={time} onSeek={seek} filmUrl={filmUrl} waveUrl={waveUrl} zoom={zoom} t={t} />
        </div>
      )}
    </div>
  );
}
