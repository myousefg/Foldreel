import { compareNames, sentenceCase, sortPathsByName } from './utils';

const names = (paths) => paths.map((p) => p.split(/[\\/]/).pop());

describe('sortPathsByName', () => {
  // The reported bug: selecting 1-20 in the Windows file dialog arrived as 5-20 then 1-4.
  test('puts a rotated 1-20 selection back in order', () => {
    const dir = 'C:\\Users\\me\\Pictures\\';
    const rotated = [...Array(16)].map((_, i) => i + 5).concat([1, 2, 3, 4]).map((n) => `${dir}${n}.jpg`);
    expect(names(sortPathsByName(rotated))).toEqual(Array.from({ length: 20 }, (_, i) => `${i + 1}.jpg`));
  });

  test('orders numbers as numbers, not text (2 before 10)', () => {
    expect(names(sortPathsByName(['x/10.png', 'x/2.png', 'x/1.png']))).toEqual(['1.png', '2.png', '10.png']);
  });

  test('ignores case and handles "(n)" style names', () => {
    expect(names(sortPathsByName(['x/photo (12).png', 'x/IMG_10.png', 'x/img_2.png', 'x/Photo (3).png'])))
      .toEqual(['img_2.png', 'IMG_10.png', 'Photo (3).png', 'photo (12).png']);
  });

  test('sorts by file name, not by the folder it is in', () => {
    expect(names(sortPathsByName(['z-folder/a.jpg', 'a-folder/b.jpg']))).toEqual(['a.jpg', 'b.jpg']);
  });

  test('accepts both slash styles and does not mutate its input', () => {
    const input = ['C:\\a\\3.jpg', 'C:/a/1.jpg', 'C:\\a\\2.jpg'];
    const copy = [...input];
    expect(names(sortPathsByName(input))).toEqual(['1.jpg', '2.jpg', '3.jpg']);
    expect(input).toEqual(copy);
  });

  test('empty input', () => {
    expect(sortPathsByName([])).toEqual([]);
  });
});

describe('compareNames', () => {
  test('is numeric and case-insensitive', () => {
    expect(compareNames('file2', 'file10')).toBeLessThan(0);
    expect(compareNames('ABC', 'abc')).toBe(0);
  });
});

describe('sentenceCase', () => {
  test('turns shouted text into sentence case', () => {
    expect(sentenceCase('DASHBOARD')).toBe('Dashboard');
    expect(sentenceCase('QUEUE & ACTIVE')).toBe('Queue & active');
  });

  test('leaves text that is not entirely upper case exactly as written', () => {
    expect(sentenceCase('Queue & Active')).toBe('Queue & Active');
    expect(sentenceCase('Einstellungen')).toBe('Einstellungen');
  });

  test('leaves empty text and scripts without case alone', () => {
    expect(sentenceCase('')).toBe('');
    expect(sentenceCase(undefined)).toBe('');
    expect(sentenceCase('設定')).toBe('設定');
  });

  test('respects the locale (Turkish dotless i)', () => {
    expect(sentenceCase('IŞIK', 'tr')).toBe('Işık');
  });
});
