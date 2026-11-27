import {
  DEFAULT_OPS, LOOKS, TONES, activeLook, aspectCrop, clamp, cssFilter, cssTransform, fadeOpacity, fitCrop, formatTime, isEdited, outputSize,
  resultLength, rulerStep, toExportOps, toneMatrix, turnedSize,
} from './editOps';

const video = { width: 640, height: 360, duration: 10 };

describe('turning and cropping', () => {
  test('a quarter turn swaps width and height, a half turn does not', () => {
    expect(turnedSize(video, { ...DEFAULT_OPS, rotate: 90 })).toEqual({ w: 360, h: 640 });
    expect(turnedSize(video, { ...DEFAULT_OPS, rotate: 270 })).toEqual({ w: 360, h: 640 });
    expect(turnedSize(video, { ...DEFAULT_OPS, rotate: 180 })).toEqual({ w: 640, h: 360 });
  });

  test('output size follows the crop and stays even', () => {
    expect(outputSize(video, DEFAULT_OPS)).toEqual({ w: 640, h: 360 });
    expect(outputSize(video, { ...DEFAULT_OPS, rotate: 90, crop: [0, 0, 1, 0.5] })).toEqual({ w: 360, h: 320 });
    expect(outputSize({ width: 101, height: 101 }, { ...DEFAULT_OPS, crop: [0, 0, 0.5, 0.5] })).toEqual({ w: 50, h: 50 });
  });

  test('an aspect crop is the biggest centred one of that shape', () => {
    const c = aspectCrop(1600, 900, 1); // square out of 16:9
    expect(c[2] * 1600).toBeCloseTo(c[3] * 900, 3);
    expect(c[3]).toBe(1);
    expect(c[0] + c[2] / 2).toBeCloseTo(0.5, 5);
    const tall = aspectCrop(900, 1600, 16 / 9); // landscape out of portrait
    expect(tall[2]).toBe(1);
    expect(tall[3]).toBeLessThan(1);
    expect(aspectCrop(100, 100, null)).toBeNull();
  });

  test('a crop is kept inside the picture', () => {
    expect(fitCrop([0.9, 0.9, 0.5, 0.5])).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(fitCrop([-1, -1, 0.001, 2])[2]).toBe(0.02);
    expect(clamp(5, 0, 3)).toBe(3);
  });
});

describe('what the preview shows', () => {
  test('no colour change means no filter at all', () => {
    expect(cssFilter(DEFAULT_OPS)).toBe('none');
    expect(cssFilter({ ...DEFAULT_OPS, brightness: 0.5 })).toContain('brightness(1.200)');
    expect(cssFilter({ ...DEFAULT_OPS, saturation: -1 })).toContain('saturate(0.000)');
  });

  test('flips are applied after the turn', () => {
    expect(cssTransform({ ...DEFAULT_OPS, rotate: 90, flipH: true })).toBe('translate(-50%, -50%) scale(-1, 1) rotate(90deg)');
  });
});

describe('what is sent to the server', () => {
  test('an untouched file has nothing to cut', () => {
    expect(isEdited(DEFAULT_OPS, video)).toBe(false);
    const sent = toExportOps(DEFAULT_OPS, video);
    expect(sent.trim_start).toBe(0);
    expect(sent.trim_end).toBeNull();
    expect(sent.crop).toBeNull();
  });

  test('trims, turns and speed all count as edits', () => {
    expect(isEdited({ ...DEFAULT_OPS, trimStart: 1 }, video)).toBe(true);
    expect(isEdited({ ...DEFAULT_OPS, trimEnd: 9 }, video)).toBe(true);
    expect(isEdited({ ...DEFAULT_OPS, trimEnd: 10 }, video)).toBe(false);
    expect(isEdited({ ...DEFAULT_OPS, speed: 2 }, video)).toBe(true);
    expect(isEdited({ ...DEFAULT_OPS, flipV: true }, video)).toBe(true);
    const sent = toExportOps({ ...DEFAULT_OPS, trimStart: 2, trimEnd: 5, rotate: 270, fadeOut: 1 }, video);
    expect(sent).toMatchObject({ trim_start: 2, trim_end: 5, rotate: 270, fade_out: 1, speed: 1 });
  });

  test('the length of the result accounts for trim and speed', () => {
    expect(resultLength(video, { ...DEFAULT_OPS, trimStart: 2, trimEnd: 6, speed: 2 })).toBe(2);
    expect(resultLength(video, DEFAULT_OPS)).toBe(10);
  });
});

describe('time labels', () => {
  test('times read as minutes, seconds and tenths', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(65.34)).toBe('1:05.3');
    expect(formatTime(65.34, false)).toBe('1:05');
    expect(formatTime(-3)).toBe('0:00.0');
  });

  test('the ruler picks wider steps for longer clips', () => {
    expect(rulerStep(6, 1200)).toBeLessThan(rulerStep(600, 1200));
    expect(rulerStep(10, 800) * (800 / 10)).toBeGreaterThanOrEqual(80);
  });
});

describe('looks, text, fades and size', () => {
  test('a tone is drawn with a named SVG filter, and has a 20 number matrix', () => {
    expect(cssFilter({ ...DEFAULT_OPS, tone: 'sepia' })).toBe('url(#edit-tone-sepia)');
    expect(cssFilter({ ...DEFAULT_OPS, tone: 'bw', contrast: 0.4 })).toContain('url(#edit-tone-bw) brightness');
    expect(toneMatrix('sepia').split(' ')).toHaveLength(20);
    expect(toneMatrix('none')).toBeNull();
    expect(Object.keys(TONES)).toEqual(['bw', 'sepia', 'warm', 'cool']);
  });

  test('the look that matches the settings is found', () => {
    expect(activeLook(DEFAULT_OPS)).toBe('none');
    const noir = LOOKS.find((l) => l.id === 'noir');
    expect(activeLook({ ...DEFAULT_OPS, tone: noir.tone, brightness: noir.brightness, contrast: noir.contrast, saturation: noir.saturation })).toBe('noir');
    expect(activeLook({ ...DEFAULT_OPS, brightness: 0.33 })).toBe('');
  });

  test('text, looks, picture fades and a size cap all count as edits and are sent', () => {
    expect(isEdited({ ...DEFAULT_OPS, tone: 'warm' }, video)).toBe(true);
    expect(isEdited({ ...DEFAULT_OPS, vFadeIn: 1 }, video)).toBe(true);
    expect(isEdited({ ...DEFAULT_OPS, height: 720 }, video)).toBe(true);
    expect(isEdited({ ...DEFAULT_OPS, texts: [{ text: '   ', x: 0.5, y: 0.5, size: 0.1, color: '#fff', box: false }] }, video)).toBe(false);
    const sent = toExportOps({ ...DEFAULT_OPS, tone: 'cool', height: 720, vFadeOut: 0.5, texts: [{ text: 'Hi', x: 0.5, y: 0.8, size: 0.08, color: '#ffffff', box: true }, { text: ' ', x: 0, y: 0, size: 0.1, color: '#fff', box: false }] }, video);
    expect(sent).toMatchObject({ tone: 'cool', height: 720, v_fade_out: 0.5 });
    expect(sent.texts).toEqual([{ text: 'Hi', x: 0.5, y: 0.8, size: 0.08, color: '#ffffff', box: true }]);
  });

  test('a size cap scales the result and keeps it even', () => {
    expect(outputSize(video, { ...DEFAULT_OPS, height: 180 })).toEqual({ w: 320, h: 180 });
    expect(outputSize(video, { ...DEFAULT_OPS, height: 2000 })).toEqual({ w: 640, h: 360 });
  });

  test('the picture fades in at the start and out at the end of the kept part', () => {
    const ops = { ...DEFAULT_OPS, trimStart: 2, trimEnd: 6, vFadeIn: 1, vFadeOut: 1 };
    expect(fadeOpacity(2, ops, video)).toBe(0);
    expect(fadeOpacity(2.5, ops, video)).toBeCloseTo(0.5, 5);
    expect(fadeOpacity(4, ops, video)).toBe(1);
    expect(fadeOpacity(5.5, ops, video)).toBeCloseTo(0.5, 5);
    expect(fadeOpacity(3, DEFAULT_OPS, video)).toBe(1);
  });
});
