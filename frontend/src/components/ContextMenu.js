import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

/**
 * A right-click menu. `items` is a list of
 *   { id, label, icon, shortcut, onSelect, disabled, danger, checked }  or  { separator: true }
 * Opens at (x, y), stays inside the window, closes on Esc / outside click / scroll,
 * and is driven by the arrow keys, Home, End and Enter like a native menu.
 */
export default function ContextMenu({ x, y, items, onClose, label }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [active, setActive] = useState(-1);
  const rows = items.filter((i) => !i.hidden);
  const enabled = rows.map((r, i) => (!r.separator && !r.disabled ? i : -1)).filter((i) => i >= 0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - height - 4)),
    });
    el.focus();
  }, [x, y, rows.length]);

  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const close = () => onClose();
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('wheel', close, { passive: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', away, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('wheel', close, { capture: true });
    };
  }, [onClose]);

  const run = (item) => {
    if (!item || item.disabled || item.separator) return;
    onClose();
    // after the menu has gone, so a dialog it opens takes focus cleanly
    setTimeout(() => item.onSelect?.(), 0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key === 'Tab') { e.preventDefault(); onClose(); return; }
    if (!enabled.length) return;
    const at = enabled.indexOf(active);
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(enabled[(at + 1) % enabled.length]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(enabled[(at <= 0 ? enabled.length : at) - 1]); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(enabled[0]); }
    else if (e.key === 'End') { e.preventDefault(); setActive(enabled[enabled.length - 1]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(rows[active]); }
  };

  return createPortal(
    <div
      ref={ref} role="menu" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[70] min-w-[220px] max-w-[320px] rounded-lg border border-border bg-popover text-popover-foreground p-1 surface-elevated outline-none"
      style={{ left: pos.left, top: pos.top }}
      data-testid="library-context-menu"
    >
      {rows.map((item, i) => {
        if (item.separator) return <div key={`s${i}`} role="separator" className="my-1 h-px bg-border" />;
        const Icon = item.icon;
        return (
          <button
            key={item.id || i} type="button" role={item.checked != null ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={item.checked != null ? !!item.checked : undefined}
            aria-disabled={item.disabled || undefined} disabled={item.disabled}
            onMouseEnter={() => !item.disabled && setActive(i)} onClick={() => run(item)}
            data-testid={item.id ? `ctx-${item.id}` : undefined}
            className={`w-full flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] text-start disabled:opacity-40 disabled:pointer-events-none ${
              active === i ? (item.danger ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground') : (item.danger ? 'text-destructive' : '')
            }`}
          >
            <span className="w-4 h-4 shrink-0 flex items-center justify-center" aria-hidden="true">
              {item.checked ? <Check className="w-4 h-4" /> : Icon ? <Icon className="w-4 h-4" /> : null}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && <span className="text-xs text-muted-foreground ps-3">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
