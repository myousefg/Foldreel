import {
  HEAD_H, buildRows, cellGeometry, entriesInRect, rectOfEntry, rowAt, rowOfEntry, stepEntry, visibleRows,
} from './virtualGrid';

const geo4 = { cols: 4, cellW: 100, cellH: 80, gap: 10, thumbH: 60 };

test('geometry fits as many columns as the width allows and stretches the cells', () => {
  const g = cellGeometry('medium', 1000); // 180 min + 12 gap
  expect(g.cols).toBe(5);
  expect(g.cellW * g.cols + g.gap * (g.cols - 1)).toBeCloseTo(1000);
  expect(cellGeometry('details', 700)).toMatchObject({ cols: 1, cellW: 700 });
  expect(cellGeometry('large', 100).cols).toBe(1); // never fewer than one column
});

test('rows hold a full line of cells, then a short last line', () => {
  const { rows, height, entries } = buildRows([{ type: 'cells', count: 10 }], geo4);
  expect(rows.map((r) => r.n)).toEqual([4, 4, 2]);
  expect(entries).toBe(10);
  expect(height).toBe(3 * 80 + 2 * 10);
  expect(rows[1].y).toBe(90);
});

test('group headings sit between runs of cells and are not entries', () => {
  const blocks = [
    { type: 'cells', count: 2 }, // folders
    { type: 'head', label: 'A', count: 5 }, { type: 'cells', count: 5 },
    { type: 'head', label: 'B', count: 1 }, { type: 'cells', count: 1 },
  ];
  const { rows, entries } = buildRows(blocks, geo4);
  expect(entries).toBe(8);
  expect(rows.map((r) => r.type)).toEqual(['cells', 'head', 'cells', 'cells', 'head', 'cells']);
  expect(rows[1].h).toBe(HEAD_H);
  // entry 2 is the first file of group A, which comes after the heading
  expect(rowOfEntry(rows, 2)).toBe(2);
  expect(rowOfEntry(rows, 7)).toBe(5);
  expect(rowOfEntry(rows, 8)).toBe(-1);
});

test('only the rows in the window are visible, with a little spare', () => {
  const { rows } = buildRows([{ type: 'cells', count: 4 * 1000 }], geo4);
  expect(rows).toHaveLength(1000);
  const [first, last] = visibleRows(rows, 90 * 500, 400, 2);
  expect(first).toBe(498);
  expect(last).toBeLessThan(510);
  expect(visibleRows(rows, 0, 100, 0)[0]).toBe(0);
  expect(visibleRows([], 0, 100)).toEqual([0, -1]);
  expect(rowAt(rows, 90 * 999 + 5)).toBe(999);
});

test('an entry knows where it is drawn', () => {
  const { rows } = buildRows([{ type: 'cells', count: 10 }], geo4);
  expect(rectOfEntry(rows, geo4, 5)).toMatchObject({ x: 110, y: 90, w: 100, h: 80, col: 1 });
  expect(rectOfEntry(rows, geo4, 99)).toBeNull();
});

test('a dragged box selects exactly the cells it touches, not the gaps', () => {
  const { rows } = buildRows([{ type: 'cells', count: 10 }], geo4);
  // covers the first two columns of the first two rows
  expect(entriesInRect(rows, geo4, { x1: 5, y1: 5, x2: 150, y2: 120 }).sort((a, b) => a - b)).toEqual([0, 1, 4, 5]);
  // inside the gap between columns 0 and 1: nothing
  expect(entriesInRect(rows, geo4, { x1: 103, y1: 10, x2: 107, y2: 20 })).toEqual([]);
  // the last row has two cells, so columns 2 and 3 do not exist there
  expect(entriesInRect(rows, geo4, { x1: 220, y1: 190, x2: 390, y2: 250 })).toEqual([]);
  // a box dragged up and to the left works the same as one dragged down and right
  expect(entriesInRect(rows, geo4, { x1: 150, y1: 120, x2: 5, y2: 5 }).sort((a, b) => a - b)).toEqual([0, 1, 4, 5]);
});

test('arrow keys move like a file manager', () => {
  expect(stepEntry(5, 'ArrowRight', geo4, 10)).toBe(6);
  expect(stepEntry(5, 'ArrowLeft', geo4, 10)).toBe(4);
  expect(stepEntry(5, 'ArrowUp', geo4, 10)).toBe(1);
  expect(stepEntry(5, 'ArrowDown', geo4, 10)).toBe(9);
  expect(stepEntry(0, 'ArrowLeft', geo4, 10)).toBe(0);
  expect(stepEntry(9, 'ArrowRight', geo4, 10)).toBe(9);
  expect(stepEntry(7, 'ArrowDown', geo4, 10)).toBe(9); // from a short last line, down lands on the last entry
  expect(stepEntry(-1, 'ArrowDown', geo4, 10)).toBe(0);
  expect(stepEntry(0, 'ArrowDown', geo4, 0)).toBe(-1);
});
