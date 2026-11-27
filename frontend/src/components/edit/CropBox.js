import { useRef } from 'react';
import { clamp } from '@/lib/editOps';

const MIN = 0.03;
const HANDLES = [
  ['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5],
];
const CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

/**
 * The crop frame drawn over the picture. `crop` is [x, y, w, h] as fractions of the picture, and
 * `ratio` (width / height in pixels, or null) keeps its shape while it is resized.
 * Everything outside it is dimmed; the handles only show while the Crop tool is open.
 */
export default function CropBox({ frame, crop, ratio, active, onChange, label }) {
  const c = crop || [0, 0, 1, 1];
  const drag = useRef(null);

  const begin = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, c: [...c] };
  };

  const move = (e) => {
    const d = drag.current;
    if (!d || !frame.w || !frame.h) return;
    const dx = (e.clientX - d.x) / frame.w;
    const dy = (e.clientY - d.y) / frame.h;
    const [x, y, w, h] = d.c;
    if (d.mode === 'move') {
      onChange([clamp(x + dx, 0, 1 - w), clamp(y + dy, 0, 1 - h), w, h]);
      return;
    }
    const west = d.mode.includes('w');
    const north = d.mode.includes('n');
    const east = d.mode.includes('e');
    const south = d.mode.includes('s');
    if (ratio && d.mode.length === 2) {
      // a corner with a fixed shape: the far corner stays put and the shape follows the pointer
      const fr = frame.w / frame.h;
      const ax = west ? x + w : x;
      const ay = north ? y + h : y;
      const maxW = Math.min(west ? ax : 1 - ax, (north ? ay : 1 - ay) * (ratio / fr));
      const tw = clamp(west ? w - dx : w + dx, MIN, Math.max(MIN, maxW));
      const th = (tw * fr) / ratio;
      onChange([west ? ax - tw : ax, north ? ay - th : ay, tw, th]);
      return;
    }
    let x1 = x;
    let y1 = y;
    let x2 = x + w;
    let y2 = y + h;
    if (west) x1 = clamp(x1 + dx, 0, x2 - MIN);
    if (east) x2 = clamp(x2 + dx, x1 + MIN, 1);
    if (north) y1 = clamp(y1 + dy, 0, y2 - MIN);
    if (south) y2 = clamp(y2 + dy, y1 + MIN, 1);
    onChange([x1, y1, x2 - x1, y2 - y1]);
  };

  const end = () => { drag.current = null; };
  const pct = (v) => `${(v * 100).toFixed(3)}%`;
  const shown = crop || active;
  if (!shown) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" data-testid="crop-layer">
      <div
        role="group" aria-label={label}
        className={`absolute border border-white/90 ${active ? 'pointer-events-auto cursor-move' : ''}`}
        style={{ left: pct(c[0]), top: pct(c[1]), width: pct(c[2]), height: pct(c[3]), boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' }}
        data-testid="crop-box"
        onPointerDown={active ? (e) => begin(e, 'move') : undefined} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      >
        {active && (
          <>
            <span className="absolute inset-x-0 top-1/3 h-px bg-white/35" aria-hidden="true" />
            <span className="absolute inset-x-0 top-2/3 h-px bg-white/35" aria-hidden="true" />
            <span className="absolute inset-y-0 left-1/3 w-px bg-white/35" aria-hidden="true" />
            <span className="absolute inset-y-0 left-2/3 w-px bg-white/35" aria-hidden="true" />
            {HANDLES.filter(([id]) => !ratio || id.length === 2).map(([id, fx, fy]) => (
              <span
                key={id} data-testid={`crop-handle-${id}`}
                onPointerDown={(e) => begin(e, id)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
                className="absolute w-3.5 h-3.5 -ms-[7px] -mt-[7px] rounded-[3px] bg-white shadow ring-1 ring-black/30"
                style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, cursor: CURSOR[id], touchAction: 'none' }}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
