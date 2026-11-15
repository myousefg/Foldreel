import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// "2" before "10", case-insensitive: how a person expects file names ordered.
export function compareNames(a, b) {
  return nameCollator.compare(a, b);
}

// The Windows file dialog (and Explorer drag-and-drop) hands back a multi-
// selection in selection-history order, not name order, so selecting 1-20
// arrives rotated (5-20 then 1-4). Sort each added batch by file name so the
// list, and any numbering applied to it, starts out in the order it looks like.
export function sortPathsByName(paths) {
  const base = (p) => String(p).split(/[\\/]/).pop();
  return [...paths].sort((x, y) => compareNames(base(x), base(y)));
}

// The nav strings ship in all caps ("DASHBOARD") in every locale. Shouted text
// is hard to read and looks templated, so show them as ordinary sentence case.
// Text that is not entirely upper case is left exactly as translated.
export function sentenceCase(text, locale) {
  const s = String(text || '');
  if (!s || s !== s.toLocaleUpperCase(locale) || s === s.toLocaleLowerCase(locale)) return s;
  const lower = s.toLocaleLowerCase(locale);
  return lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1);
}
