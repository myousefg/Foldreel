// Dragging files around inside the Library. The paths travel in their own data type, so
// a drag from Explorer (which carries real files) is never mistaken for one of ours.
export const DRAG_TYPE = 'application/x-foldreel-paths';

export const isLibraryDrag = (e) => Array.from(e.dataTransfer?.types || []).includes(DRAG_TYPE);

export function readDrag(e) {
  try {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? list : null;
  } catch { return null; }
}

/** A small badge to drag around instead of a screenshot of the tile. */
export function setDragBadge(e, count, label) {
  const el = document.createElement('div');
  el.textContent = count > 1 ? `${count}` : label;
  el.style.cssText = 'position:fixed;top:-100px;left:-100px;padding:4px 10px;border-radius:8px;background:#1f2937;color:#fff;font:600 12px system-ui;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  document.body.appendChild(el);
  e.dataTransfer.setDragImage(el, 10, 10);
  setTimeout(() => el.remove(), 0);
}
