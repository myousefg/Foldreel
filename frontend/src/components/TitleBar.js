import { useEffect, useRef } from 'react';

/** True in the desktop app on Windows, where the window's own title bar is replaced by this strip. */
export const hasCustomTitleBar = () => typeof window !== 'undefined' && !!window.electronAPI?.customTitleBar;

const hex = (rgb) => {
  const m = String(rgb).match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return null;
  return `#${m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * The top strip of the window: the app's name on the left (drag it to move the window, double-click to
 * maximise) and, on the right, the real minimise / maximise / close buttons that Windows draws over it.
 * The buttons take their colours from the theme, so they follow it when it changes.
 */
export default function TitleBar() {
  const probe = useRef(null);

  useEffect(() => {
    const sync = () => {
      const el = probe.current;
      if (!el || !window.electronAPI?.setTitleBar) return;
      const cs = getComputedStyle(el);
      const color = hex(cs.backgroundColor);
      const symbolColor = hex(cs.color);
      if (color && symbolColor) window.electronAPI.setTitleBar({ color, symbolColor }).catch(() => {});
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', sync);
    return () => { observer.disconnect(); media.removeEventListener('change', sync); };
  }, []);

  return (
    <div
      ref={probe}
      className="app-drag h-10 shrink-0 flex items-center gap-2 ps-4 select-none bg-[hsl(var(--sidebar-background))] text-foreground border-b border-[hsl(var(--sidebar-border))]"
      style={{ paddingInlineEnd: 'calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))' }}
      data-testid="titlebar"
    >
      <img src={`${process.env.PUBLIC_URL}/icon.png`} alt="" width="18" height="18" className="w-[18px] h-[18px] rounded-[4px]" draggable={false} />
      <span className="text-[13px] font-medium tracking-tight">Foldreel</span>
    </div>
  );
}
