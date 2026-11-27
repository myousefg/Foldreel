// The edits the Edit page keeps, and the arithmetic around them. Pure functions, so the preview on
// screen and the file ffmpeg writes can be checked against each other.

export const DEFAULT_OPS = Object.freeze({
  trimStart: 0,
  trimEnd: null,       // null = to the end
  rotate: 0,           // clockwise degrees: 0, 90, 180, 270
  flipH: false,
  flipV: false,
  crop: null,          // [x, y, w, h] as fractions of the turned picture, null = whole picture
  brightness: 0,       // -1 .. 1
  contrast: 0,
  saturation: 0,
  speed: 1,
  volume: 1,           // 0 .. 2
  mute: false,
  fadeIn: 0,
  fadeOut: 0,
  format: 'auto',
  quality: 'high',
});

export const ASPECTS = [
  { id: 'free', ratio: null },
  { id: 'original', ratio: 'original' },
  { id: '1:1', ratio: 1 },
  { id: '4:5', ratio: 4 / 5 },
  { id: '9:16', ratio: 9 / 16 },
  { id: '16:9', ratio: 16 / 9 },
  { id: '4:3', ratio: 4 / 3 },
  { id: '3:2', ratio: 3 / 2 },
];

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The picture's size once it has been turned (a quarter turn swaps width and height). */
export function turnedSize(info, ops) {
  const swap = ops.rotate % 180 !== 0;
  return swap ? { w: info.height, h: info.width } : { w: info.width, h: info.height };
}

/** Size of the file that will be written, in pixels. */
export function outputSize(info, ops) {
  const t = turnedSize(info, ops);
  if (!ops.crop) return t;
  const [, , w, h] = ops.crop;
  return { w: Math.max(2, Math.floor((t.w * w) / 2) * 2), h: Math.max(2, Math.floor((t.h * h) / 2) * 2) };
}

/** The biggest centred crop of a given shape. `ratio` is width / height in pixels. */
export function aspectCrop(frameW, frameH, ratio) {
  if (!ratio || !frameW || !frameH) return null;
  const frameRatio = frameW / frameH;
  let w = 1;
  let h = 1;
  if (ratio > frameRatio) h = frameRatio / ratio; else w = ratio / frameRatio;
  return [(1 - w) / 2, (1 - h) / 2, w, h];
}

/** Keep a crop inside the picture and no smaller than a few pixels. */
export function fitCrop(c, minFrac = 0.02) {
  let [x, y, w, h] = c;
  w = clamp(w, minFrac, 1);
  h = clamp(h, minFrac, 1);
  x = clamp(x, 0, 1 - w);
  y = clamp(y, 0, 1 - h);
  return [x, y, w, h];
}

/** The CSS that makes the preview look like the exported colours. */
export function cssFilter(ops) {
  const b = 1 + ops.brightness * 0.4;
  const c = 1 + ops.contrast * 0.5;
  const s = 1 + ops.saturation;
  return ops.brightness || ops.contrast || ops.saturation ? `brightness(${b.toFixed(3)}) contrast(${c.toFixed(3)}) saturate(${s.toFixed(3)})` : 'none';
}

/** The CSS transform that turns and flips the picture inside its frame. */
export function cssTransform(ops) {
  return `translate(-50%, -50%) scale(${ops.flipH ? -1 : 1}, ${ops.flipV ? -1 : 1}) rotate(${ops.rotate}deg)`;
}

export function isEdited(ops, info) {
  const d = DEFAULT_OPS;
  const end = ops.trimEnd == null ? info?.duration || 0 : ops.trimEnd;
  return ops.trimStart > 0.01 || (info?.duration && end < info.duration - 0.01)
    || ops.rotate !== d.rotate || ops.flipH || ops.flipV || !!ops.crop
    || ops.brightness !== 0 || ops.contrast !== 0 || ops.saturation !== 0
    || ops.speed !== 1 || ops.volume !== 1 || ops.mute || ops.fadeIn > 0 || ops.fadeOut > 0;
}

/** What the server is sent. */
export function toExportOps(ops, info) {
  const end = ops.trimEnd != null && info?.duration && ops.trimEnd < info.duration - 0.01 ? ops.trimEnd : null;
  return {
    trim_start: ops.trimStart || 0,
    trim_end: end,
    rotate: ops.rotate,
    flip_h: ops.flipH,
    flip_v: ops.flipV,
    crop: ops.crop,
    brightness: ops.brightness,
    contrast: ops.contrast,
    saturation: ops.saturation,
    speed: ops.speed,
    volume: ops.volume,
    mute: ops.mute,
    fade_in: ops.fadeIn,
    fade_out: ops.fadeOut,
    format: ops.format,
    quality: ops.quality,
  };
}

export function formatOptions(kind) {
  if (kind === 'image') return ['auto', 'jpg', 'png', 'webp'];
  if (kind === 'audio') return ['mp3'];
  return ['auto', 'mp4', 'webm', 'gif', 'mp3'];
}

/** 1:05.3 */
export function formatTime(t, withTenths = true) {
  const v = Math.max(0, Number(t) || 0);
  const m = Math.floor(v / 60);
  const s = v - m * 60;
  return `${m}:${(withTenths ? s.toFixed(1) : String(Math.floor(s))).padStart(withTenths ? 4 : 2, '0')}`;
}

/** The length of the result: the kept part, played at the chosen speed. */
export function resultLength(info, ops) {
  const end = ops.trimEnd == null ? info.duration : Math.min(ops.trimEnd, info.duration);
  return Math.max(0, end - ops.trimStart) / (ops.speed || 1);
}

/** Tick spacing for the ruler, in seconds, so labels stay about 80px apart. */
export function rulerStep(duration, widthPx) {
  const target = (duration / Math.max(widthPx, 1)) * 80;
  for (const step of [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) if (step >= target) return step;
  return 600;
}
