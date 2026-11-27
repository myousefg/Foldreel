import { TONES, toneMatrix } from '@/lib/editOps';

// The colour looks as SVG filters, so a CSS filter on the preview can name them. Drawn in sRGB, like ffmpeg.
export default function ToneDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {Object.keys(TONES).map((k) => (
          <filter key={k} id={`edit-tone-${k}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={toneMatrix(k)} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
