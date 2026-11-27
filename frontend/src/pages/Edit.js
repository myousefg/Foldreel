import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Crop, FileVideo, FolderOpen, Gauge, Loader2, Pause, Play, Redo2, RotateCw, Scissors, SlidersHorizontal, Undo2, Volume2, X, Music, Save, ImagePlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { PageActions } from '@/components/PageHeader';
import DropOverlay from '@/components/DropOverlay';
import CropBox from '@/components/edit/CropBox';
import Timeline from '@/components/edit/Timeline';
import { CropPanel, RotatePanel, AdjustPanel, SpeedPanel, AudioPanel } from '@/components/edit/Panels';
import { useI18n } from '@/context/I18nProvider';
import { editApi, mediaUrl, organizeThumbUrl } from '@/lib/api';
import { isElectron } from '@/lib/electron';
import { handoff } from '@/lib/handoff';
import {
  clamp, cssFilter, cssTransform, formatOptions, formatTime, isEdited, resultLength, toExportOps, turnedSize,
} from '@/lib/editOps';
import { useEditOps } from '@/lib/useEditOps';

const TOOLS = {
  image: ['crop', 'rotate', 'adjust'],
  video: ['crop', 'rotate', 'adjust', 'speed', 'audio'],
  audio: ['speed', 'audio'],
};
const TOOL_ICON = { crop: Crop, rotate: RotateCw, adjust: SlidersHorizontal, speed: Gauge, audio: Volume2 };

export default function Edit() {
  const { t } = useI18n();
  const { ops, set, undo, redo, reset, canUndo, canRedo } = useEditOps();
  const [path, setPath] = useState('');
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tool, setTool] = useState('crop');
  const [aspect, setAspect] = useState('free');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [stage, setStage] = useState({ w: 800, h: 450 });
  const [job, setJob] = useState(null);
  const stageRef = useRef(null);
  const mediaRef = useRef(null);
  const opsRef = useRef(ops);
  opsRef.current = ops;

  // ── opening a file ──────────────────────────────────────────────────────────
  const load = useCallback(async (p) => {
    if (!p) return;
    setLoading(true);
    try {
      const i = await editApi.info(p);
      setPath(p); setInfo(i); setTime(0); setPlaying(false); setPreviewFailed(false); setJob(null);
      reset(false);
      setAspect('free');
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
        if (m.currentTime >= stop - 0.03) { m.pause(); setPlaying(false); seek(o.trimStart); return; }
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
      } else if (k === 'i') { set({ trimStart: clamp(time, 0, end - 0.1) }); }
      else if (k === 'o') { set({ trimEnd: clamp(time, start + 0.1, duration) }); }
      else if (k === 'home') seek(start);
      else if (k === 'end') seek(end);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [info, kind, time, start, end, duration, togglePlay, seek, set, undo, redo]);

  // ── saving a copy ───────────────────────────────────────────────────────────
  const running = job?.status === 'running';
  const runExport = async () => {
    try {
      const j = await editApi.export(path, toExportOps(ops, info));
      setJob({ ...j, status: 'running', pct: 0 });
    } catch (e) {
      toast.error(t('edit.export.failed', { error: e?.response?.data?.detail || '' }));
    }
  };
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

  const toolList = TOOLS[kind];
  const length = info ? resultLength(info, ops) : 0;
  const filmUrl = useMemo(() => (info?.kind === 'video' ? editApi.filmstripUrl(path, 14, 56) : ''), [info, path]);
  const waveUrl = useMemo(() => (info?.has_audio ? editApi.waveformUrl(path, 1400, info.kind === 'audio' ? 80 : 40) : ''), [info, path]);

  // ── nothing open yet ────────────────────────────────────────────────────────
  if (!info) {
    return (
      <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} data-testid="edit-empty">
        <DropOverlay />
        <div className="w-full rounded-xl border border-dashed border-border py-20 flex flex-col items-center gap-4 text-center">
          <span className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            {loading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-hidden="true" /> : <Scissors className="w-5 h-5 text-muted-foreground" aria-hidden="true" />}
          </span>
          <div>
            <p className="text-sm font-medium">{t('edit.empty')}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">{t('edit.emptyDesc')}</p>
          </div>
          <Button onClick={browse} disabled={!isElectron || loading} data-testid="edit-choose">
            <ImagePlus className="w-4 h-4 me-2" aria-hidden="true" /> {t('edit.choose')}
          </Button>
        </div>
      </div>
    );
  }

  const formats = formatOptions(kind);
  const panel = {
    crop: <CropPanel info={info} ops={ops} set={set} aspect={aspect} setAspect={setAspect} t={t} />,
    rotate: <RotatePanel ops={ops} set={set} t={t} />,
    adjust: <AdjustPanel ops={ops} set={set} t={t} />,
    speed: <SpeedPanel ops={ops} set={set} t={t} />,
    audio: <AudioPanel info={info} ops={ops} set={set} t={t} />,
  }[tool];
  const cropRatio = aspect === 'free' || aspect === 'original' ? null
    : (() => { const [a, b] = aspect.split(':').map(Number); return a / b; })();
  const mediaStyle = {
    position: 'absolute', left: '50%', top: '50%', width: info.width * scale, height: info.height * scale,
    transform: cssTransform(ops), filter: cssFilter(ops), maxWidth: 'none',
  };
  const poster = organizeThumbUrl(path, 640);

  return (
    <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 7.25rem)' }} onDragOver={(e) => e.preventDefault()} onDrop={onDrop} data-testid="edit-page">
      <DropOverlay />
      <PageActions>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!canUndo} title={`${t('edit.undo')} (Ctrl+Z)`} aria-label={t('edit.undo')} data-testid="edit-undo"><Undo2 className="w-4 h-4" aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!canRedo} title={`${t('edit.redo')} (Ctrl+Shift+Z)`} aria-label={t('edit.redo')} data-testid="edit-redo"><Redo2 className="w-4 h-4" aria-hidden="true" /></Button>
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground" onClick={() => { reset(true); setAspect('free'); }} disabled={!isEdited(ops, info)} data-testid="edit-reset">{t('edit.resetAll')}</Button>
        <Button variant="outline" size="sm" className="h-8" onClick={browse} disabled={!isElectron || running}>{t('edit.change')}</Button>
      </PageActions>

      {/* file and save bar */}
      <div className="flex items-center gap-3 flex-wrap">
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
                <span className="truncate max-w-[200px]" title={job.out_path}>{t('edit.export.done', { name: job.out_name })}</span>
                {isElectron && window.electronAPI.showInFolder && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.electronAPI.showInFolder(job.out_path)} title={t('library.showInFolder')} aria-label={t('library.showInFolder')}><FolderOpen className="w-3.5 h-3.5" /></Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => load(job.out_path)}>{t('edit.export.editCopy')}</Button>
              </div>
            )}
            <Select value={ops.format} onValueChange={(v) => set({ format: v })}>
              <SelectTrigger className="h-8 w-44 text-xs" aria-label={t('edit.export.format')} data-testid="edit-format"><SelectValue /></SelectTrigger>
              <SelectContent>{formats.map((f) => <SelectItem key={f} value={f}>{t(`edit.format.${f}`)}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={ops.quality} onValueChange={(v) => set({ quality: v })}>
              <SelectTrigger className="h-8 w-32 text-xs" aria-label={t('edit.export.quality')} data-testid="edit-quality"><SelectValue /></SelectTrigger>
              <SelectContent>{['high', 'balanced', 'small'].map((q) => <SelectItem key={q} value={q}>{t(`edit.quality.${q}`)}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" className="h-8" onClick={runExport} data-testid="edit-export"><Save className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />{t('edit.export.save')}</Button>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        {/* tools */}
        <div className="w-[68px] shrink-0 flex flex-col gap-1" role="tablist" aria-orientation="vertical" aria-label={t('edit.toolsLabel')}>
          {toolList.map((id) => {
            const Icon = TOOL_ICON[id];
            return (
              <button
                key={id} type="button" role="tab" aria-selected={tool === id} onClick={() => setTool(id)} data-testid={`tool-${id}`}
                className={`h-16 rounded-lg flex flex-col items-center justify-center gap-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  tool === id ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
              >
                <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} aria-hidden="true" />
                {t(`edit.tools.${id}`)}
              </button>
            );
          })}
        </div>
        <div className="w-64 shrink-0 overflow-y-auto rounded-xl border border-border bg-card p-4" role="tabpanel" data-testid="edit-panel">{panel}</div>

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
              <CropBox frame={frame} crop={ops.crop} ratio={cropRatio} active={tool === 'crop'} onChange={(c) => set({ crop: c })} label={t('edit.tools.crop')} />
            </div>
          )}
          {previewFailed && kind !== 'image' && (
            <p className="absolute inset-x-4 bottom-3 rounded-md bg-black/70 px-3 py-2 text-xs text-white/90" role="alert">{t('edit.previewFailed')}</p>
          )}
        </div>
      </div>

      {/* transport and timeline */}
      {kind !== 'image' && (
        <div className="shrink-0 rounded-xl border border-border bg-card px-4 py-3 space-y-2" data-testid="edit-bottom">
          <div className="flex items-center gap-3 text-xs">
            <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full" onClick={togglePlay} aria-label={t(playing ? 'edit.pause' : 'edit.play')} data-testid="edit-play">
              {playing ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4 ms-0.5" aria-hidden="true" />}
            </Button>
            <span className="tabular-nums font-medium" data-testid="edit-time">{formatTime(time)}</span>
            <span className="text-muted-foreground tabular-nums">/ {formatTime(duration)}</span>
            <span className="mx-1 w-px h-4 bg-border" aria-hidden="true" />
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set({ trimStart: clamp(time, 0, end - 0.1) })} data-testid="edit-set-start">{t('edit.setStart')}</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set({ trimEnd: clamp(time, start + 0.1, duration) })} data-testid="edit-set-end">{t('edit.setEnd')}</Button>
            <span className="ms-auto text-muted-foreground tabular-nums" data-testid="edit-kept">
              {t('edit.kept', { from: formatTime(start), to: formatTime(end), length: formatTime(length) })}
            </span>
          </div>
          <Timeline info={{ ...info, path }} ops={ops} set={set} time={time} onSeek={seek} filmUrl={filmUrl} waveUrl={waveUrl} t={t} />
        </div>
      )}
    </div>
  );
}
