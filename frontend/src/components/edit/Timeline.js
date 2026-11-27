import { useEffect, useRef, useState } from 'react';
import { clamp, formatTime, rulerStep } from '@/lib/editOps';

const TRIM_MIN = 0.1; // the shortest piece that can be kept, in seconds

/**
 * The strip under the preview: a ruler, the frames of the video, the sound wave, the part that is
 * kept (with a handle at each end) and the playhead. Drag a handle to trim, drag anywhere else to scrub.
 */
export default function Timeline({ info, ops, set, time, onSeek, filmUrl, waveUrl, t }) {
  const box = useRef(null);
  const drag = useRef(null);
  const [width, setWidth] = useState(800);
  const [filmOk, setFilmOk] = useState(true);
  const [waveOk, setWaveOk] = useState(true);
  const duration = info.duration || 1;
  const start = ops.trimStart;
  const end = ops.trimEnd == null ? duration : Math.min(ops.trimEnd, duration);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth || 800);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setFilmOk(true); setWaveOk(true); }, [info.path]);

  const x = (sec) => (sec / duration) * width;
  const at = (clientX) => {
    const r = box.current.getBoundingClientRect();
    return clamp(((clientX - r.left) / width) * duration, 0, duration);
  };

  const begin = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = mode;
    if (mode === 'play') onSeek(clamp(at(e.clientX), start, end));
  };
  const move = (e) => {
    const mode = drag.current;
    if (!mode) return;
    const sec = at(e.clientX);
    if (mode === 'play') onSeek(clamp(sec, start, end));
    else if (mode === 'start') { const v = clamp(sec, 0, end - TRIM_MIN); set({ trimStart: v < 0.02 ? 0 : v }); onSeek(v); }
    else if (mode === 'end') { const v = clamp(sec, start + TRIM_MIN, duration); set({ trimEnd: v > duration - 0.02 ? null : v }); onSeek(v); }
  };
  const finish = () => { drag.current = null; };

  const step = rulerStep(duration, width);
  const ticks = [];
  for (let s = 0; s <= duration + 1e-6; s += step) ticks.push(s);

  const handle = (side) => (
    <button
      type="button" aria-label={t(side === 'start' ? 'edit.trimStart' : 'edit.trimEnd')} data-testid={`trim-${side}`}
      onPointerDown={(e) => begin(e, side)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
      onKeyDown={(e) => {
        const d = e.shiftKey ? 1 : 0.1;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          const dir = e.key === 'ArrowLeft' ? -1 : 1;
          if (side === 'start') set({ trimStart: clamp(start + dir * d, 0, end - TRIM_MIN) });
          else set({ trimEnd: clamp(end + dir * d, start + TRIM_MIN, duration) });
        }
      }}
      className="absolute top-0 bottom-0 w-3 -ms-1.5 z-20 flex items-center justify-center rounded-[3px] bg-primary text-primary-foreground cursor-ew-resize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      style={{ left: x(side === 'start' ? start : end), touchAction: 'none' }}
    >
      <span className="w-0.5 h-4 rounded bg-primary-foreground/80" aria-hidden="true" />
    </button>
  );

  const hasFilm = info.kind === 'video' && filmOk;
  const hasWave = info.has_audio && waveOk;

  return (
    <div className="select-none" data-testid="timeline">
      <div ref={box} className="relative" style={{ touchAction: 'none' }}
        onPointerDown={(e) => begin(e, 'play')} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
        {/* ruler */}
        <div className="relative h-5 text-[10px] text-muted-foreground tabular-nums" aria-hidden="true">
          {ticks.filter((s) => x(s) < width - 44).map((s) => (
            <span key={s} className="absolute top-0 h-full border-s border-border ps-1 leading-5 whitespace-nowrap" style={{ left: x(s) }}>
              {formatTime(s, step < 1)}
            </span>
          ))}
        </div>

        {/* tracks */}
        <div className="relative rounded-md overflow-hidden bg-muted ring-1 ring-inset ring-border">
          {info.kind === 'video' && (
            <div className="h-14 bg-black/40 relative" data-testid="film-track">
              {hasFilm && (
                <img src={filmUrl} alt="" draggable={false} onError={() => setFilmOk(false)} className="absolute inset-0 w-full h-full object-fill opacity-90" />
              )}
            </div>
          )}
          {(info.has_audio || info.kind === 'audio') && (
            <div className={`${info.kind === 'audio' ? 'h-20' : 'h-10 border-t border-border/60'} bg-card relative`} data-testid="wave-track">
              {hasWave && (
                <img src={waveUrl} alt="" draggable={false} onError={() => setWaveOk(false)} className="absolute inset-0 w-full h-full object-fill opacity-80" />
              )}
            </div>
          )}
          {/* what is cut away */}
          <div className="absolute inset-y-0 start-0 bg-black/65 pointer-events-none" style={{ width: x(start) }} />
          <div className="absolute inset-y-0 bg-black/65 pointer-events-none" style={{ left: x(end), right: 0 }} />
          {/* frame around what is kept */}
          <div className="absolute inset-y-0 border-y-2 border-primary pointer-events-none" style={{ left: x(start), width: Math.max(0, x(end) - x(start)) }} />
        </div>

        <div className="absolute left-0 right-0" style={{ top: 20, bottom: 0 }}>
          {handle('start')}
          {handle('end')}
        </div>

        {/* playhead */}
        <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: x(time) }} data-testid="playhead">
          <span className="absolute -ms-[5px] top-3 w-2.5 h-2.5 rotate-45 bg-white rounded-[2px] shadow" aria-hidden="true" />
          <span className="absolute -ms-px top-4 bottom-0 w-0.5 bg-white shadow" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
