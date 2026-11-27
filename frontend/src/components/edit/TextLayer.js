import { useRef } from 'react';
import { clamp } from '@/lib/editOps';

const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * The text laid over the picture. Positions and sizes are fractions of what will be saved (the cropped
 * picture), so the preview and the file agree. While the Text tool is open a line can be dragged.
 */
export default function TextLayer({ frame, crop, texts, selected, onSelect, onMove, interactive }) {
  const drag = useRef(null);
  const [cx, cy, cw, ch] = crop || [0, 0, 1, 1];
  if (!texts.length) return null;

  const begin = (e, i) => {
    onSelect(i);
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { i, x: e.clientX, y: e.clientY, tx: texts[i].x, ty: texts[i].y };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || !frame.w || !frame.h) return;
    const nx = d.tx + (e.clientX - d.x) / (frame.w * cw);
    const ny = d.ty + (e.clientY - d.y) / (frame.h * ch);
    onMove(d.i, { x: clamp(nx, 0, 1), y: clamp(ny, 0, 1) });
  };
  const end = () => { drag.current = null; };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" data-testid="text-layer">
      {texts.map((t, i) => {
        if (!t.text.trim()) return null;
        const px = Math.max(6, t.size * ch * frame.h);
        return (
          <div
            key={i} data-testid={`text-item-${i}`}
            onPointerDown={interactive ? (e) => begin(e, i) : undefined} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
            className={`absolute whitespace-pre-wrap text-center leading-tight select-none ${interactive ? 'pointer-events-auto cursor-move' : ''} ${interactive && selected === i ? 'outline outline-1 outline-dashed outline-white/80' : ''}`}
            style={{
              left: `${(cx + t.x * cw) * 100}%`, top: `${(cy + t.y * ch) * 100}%`, transform: 'translate(-50%, -50%)',
              fontFamily: FONT, fontSize: px, color: t.color, touchAction: 'none',
              background: t.box ? 'rgba(0,0,0,0.55)' : 'transparent', padding: t.box ? `${Math.round(px / 8)}px ${Math.round(px / 4)}px` : 0,
              textShadow: t.box ? 'none' : '0 1px 3px rgba(0,0,0,0.5)',
            }}
          >
            {t.text}
          </div>
        );
      })}
    </div>
  );
}
