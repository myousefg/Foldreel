// Layout for the Library's list of files, as plain functions so it can be tested.
//
// A library can hold tens of thousands of files, so only the rows on screen are
// drawn. The page's content is a list of blocks (a run of folders, a group heading,
// a run of files); this turns them into rows with fixed heights, and answers
// "which rows are visible", "where is entry N" and "which entries does this
// rectangle touch" without touching the DOM.

export const MODES = {
  details: { list: true, rowH: 36, gap: 0 },
  tiles:   { minW: 300, tileH: 76, gap: 8 },
  small:   { minW: 120, caption: 40, gap: 10, ratio: 1 },
  medium:  { minW: 180, caption: 44, gap: 12, ratio: 1 },
  large:   { minW: 280, caption: 46, gap: 14, ratio: 0.75 },
};
export const HEAD_H = 40;

/** Columns, cell size and gap for a mode at a given content width. */
export function cellGeometry(mode, width) {
  const m = MODES[mode] || MODES.medium;
  const w = Math.max(width, 160);
  if (m.list) return { cols: 1, cellW: w, cellH: m.rowH, gap: 0, thumbH: 0 };
  const cols = Math.max(1, Math.floor((w + m.gap) / (m.minW + m.gap)));
  const cellW = (w - m.gap * (cols - 1)) / cols;
  if (m.tileH) return { cols, cellW, cellH: m.tileH, gap: m.gap, thumbH: m.tileH - 16 };
  const thumbH = Math.round(cellW * m.ratio);
  return { cols, cellW, cellH: thumbH + m.caption, gap: m.gap, thumbH };
}

/**
 * blocks: [{ type: 'cells', count }, { type: 'head', label, count, key }]
 * Cells are numbered across all blocks in order (entry 0, 1, 2 ...); headings are not entries.
 */
export function buildRows(blocks, geo) {
  const rows = [];
  let y = 0;
  let entry = 0;
  for (let b = 0; b < blocks.length; b += 1) {
    const blk = blocks[b];
    if (blk.type === 'head') {
      rows.push({ type: 'head', y, h: HEAD_H, block: b, label: blk.label, count: blk.count, key: blk.key });
      y += HEAD_H;
      continue;
    }
    for (let i = 0; i < blk.count; i += geo.cols) {
      const n = Math.min(geo.cols, blk.count - i);
      rows.push({ type: 'cells', y, h: geo.cellH, block: b, first: entry + i, n });
      y += geo.cellH + geo.gap;
    }
    entry += blk.count;
  }
  return { rows, height: Math.max(0, y - (geo.gap || 0)), entries: entry };
}

/** Index of the first row whose bottom is below `y`. */
export function rowAt(rows, y) {
  let lo = 0;
  let hi = rows.length - 1;
  let ans = rows.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].y + rows[mid].h > y) { ans = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return ans;
}

/** Rows to draw for a scroll window, with a little spare above and below. */
export function visibleRows(rows, scrollTop, viewH, spare = 3) {
  if (!rows.length) return [0, -1];
  const first = Math.max(0, rowAt(rows, scrollTop) - spare);
  const last = Math.min(rows.length - 1, rowAt(rows, scrollTop + viewH) + spare);
  return [first, last];
}

/** Row holding entry number `idx` (binary search over the cell rows). */
export function rowOfEntry(rows, idx) {
  let lo = 0;
  let hi = rows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = rows[mid];
    if (r.type === 'head') {
      // headings sit between cell rows; look to the next cell row
      let k = mid + 1;
      while (k < rows.length && rows[k].type === 'head') k += 1;
      if (k >= rows.length) { hi = mid - 1; continue; }
      if (rows[k].first > idx) hi = mid - 1; else lo = mid + 1;
      continue;
    }
    if (idx < r.first) hi = mid - 1;
    else if (idx >= r.first + r.n) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Box of entry `idx` in content coordinates. */
export function rectOfEntry(rows, geo, idx) {
  const ri = rowOfEntry(rows, idx);
  if (ri < 0) return null;
  const r = rows[ri];
  const col = idx - r.first;
  return { x: col * (geo.cellW + geo.gap), y: r.y, w: geo.cellW, h: r.h, row: ri, col };
}

/** Entries whose boxes the rectangle touches (content coordinates). */
export function entriesInRect(rows, geo, rect) {
  const x1 = Math.min(rect.x1, rect.x2);
  const x2 = Math.max(rect.x1, rect.x2);
  const y1 = Math.min(rect.y1, rect.y2);
  const y2 = Math.max(rect.y1, rect.y2);
  const out = [];
  const step = geo.cellW + geo.gap;
  const c1 = Math.max(0, Math.floor(x1 / step));
  const c2 = Math.min(geo.cols - 1, Math.floor(x2 / step));
  for (let ri = rowAt(rows, y1); ri < rows.length && rows[ri].y <= y2; ri += 1) {
    const r = rows[ri];
    if (r.type !== 'cells') continue;
    for (let c = c1; c <= c2; c += 1) {
      // The box must really overlap, not just share a column (the gap is dead space).
      const left = c * step;
      if (c >= r.n || left + geo.cellW < x1 || left > x2) continue;
      out.push(r.first + c);
    }
  }
  return out;
}

/** Entry reached by an arrow key from `idx`, staying inside 0..total-1. */
export function stepEntry(idx, key, geo, total) {
  if (total <= 0) return -1;
  if (idx < 0) return 0;
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -geo.cols, ArrowDown: geo.cols }[key];
  if (delta === undefined) return idx;
  const next = idx + delta;
  if (next < 0 || next >= total) {
    // Down from the last row lands on the last entry, like a file manager.
    return (key === 'ArrowDown' && idx < total - 1) ? total - 1 : idx;
  }
  return next;
}
