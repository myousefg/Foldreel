import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ASPECTS, SPEEDS, aspectCrop, outputSize, turnedSize } from '@/lib/editOps';

function Field({ label, value, children, testId }) {
  return (
    <div className="space-y-2" data-testid={testId}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium">{label}</span>
        {value != null && <span className="text-[11px] text-muted-foreground tabular-nums">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function PanelTitle({ children, onReset, resetLabel }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[13px] font-semibold">{children}</h2>
      {onReset && (
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={onReset}>{resetLabel}</Button>
      )}
    </div>
  );
}

export function CropPanel({ info, ops, set, aspect, setAspect, t }) {
  const turned = turnedSize(info, ops);
  const out = outputSize(info, ops);
  const pick = (a) => {
    setAspect(a.id);
    if (a.ratio == null) return;
    const ratio = a.ratio === 'original' ? turned.w / turned.h : a.ratio;
    set({ crop: a.id === 'original' ? null : aspectCrop(turned.w, turned.h, ratio) });
  };
  return (
    <div>
      <PanelTitle onReset={ops.crop ? () => { set({ crop: null }); setAspect('free'); } : null} resetLabel={t('edit.crop.reset')}>{t('edit.tools.crop')}</PanelTitle>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t('edit.crop.shape')}>
        {ASPECTS.map((a) => (
          <button
            key={a.id} type="button" role="radio" aria-checked={aspect === a.id} onClick={() => pick(a)} data-testid={`aspect-${a.id}`}
            className={`h-9 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              aspect === a.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
          >
            {a.id === 'free' || a.id === 'original' ? t(`edit.crop.${a.id}`) : a.id}
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground tabular-nums" data-testid="crop-size">{t('edit.crop.size', { w: out.w, h: out.h })}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('edit.crop.hint')}</p>
    </div>
  );
}

export function RotatePanel({ ops, set, t }) {
  const turn = (d) => set({ rotate: (ops.rotate + d + 360) % 360, crop: null });
  const btn = 'h-16 flex-col gap-1.5 text-xs';
  const edited = ops.rotate !== 0 || ops.flipH || ops.flipV;
  return (
    <div>
      <PanelTitle onReset={edited ? () => set({ rotate: 0, flipH: false, flipV: false, crop: null }) : null} resetLabel={t('edit.reset')}>{t('edit.tools.rotate')}</PanelTitle>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className={btn} onClick={() => turn(-90)} data-testid="rotate-left"><RotateCcw className="w-5 h-5" aria-hidden="true" />{t('edit.rotate.left')}</Button>
        <Button variant="outline" className={btn} onClick={() => turn(90)} data-testid="rotate-right"><RotateCw className="w-5 h-5" aria-hidden="true" />{t('edit.rotate.right')}</Button>
        <Button variant={ops.flipH ? 'secondary' : 'outline'} aria-pressed={ops.flipH} className={btn} onClick={() => set({ flipH: !ops.flipH })} data-testid="flip-h"><FlipHorizontal2 className="w-5 h-5" aria-hidden="true" />{t('edit.rotate.flipH')}</Button>
        <Button variant={ops.flipV ? 'secondary' : 'outline'} aria-pressed={ops.flipV} className={btn} onClick={() => set({ flipV: !ops.flipV })} data-testid="flip-v"><FlipVertical2 className="w-5 h-5" aria-hidden="true" />{t('edit.rotate.flipV')}</Button>
      </div>
      <p className="mt-4 text-xs text-muted-foreground tabular-nums">{t('edit.rotate.now', { deg: ops.rotate })}</p>
    </div>
  );
}

const pctText = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;

export function AdjustPanel({ ops, set, t }) {
  const edited = ops.brightness !== 0 || ops.contrast !== 0 || ops.saturation !== 0;
  return (
    <div className="space-y-5">
      <PanelTitle onReset={edited ? () => set({ brightness: 0, contrast: 0, saturation: 0 }) : null} resetLabel={t('edit.reset')}>{t('edit.tools.adjust')}</PanelTitle>
      {[['brightness', 'edit.adjust.brightness'], ['contrast', 'edit.adjust.contrast'], ['saturation', 'edit.adjust.saturation']].map(([key, label]) => (
        <Field key={key} label={t(label)} value={pctText(ops[key])} testId={`adjust-${key}`}>
          <Slider min={-100} max={100} step={1} value={[Math.round(ops[key] * 100)]} onValueChange={([v]) => set({ [key]: v / 100 })} aria-label={t(label)} />
        </Field>
      ))}
    </div>
  );
}

export function SpeedPanel({ ops, set, t }) {
  return (
    <div>
      <PanelTitle onReset={ops.speed !== 1 ? () => set({ speed: 1 }) : null} resetLabel={t('edit.reset')}>{t('edit.tools.speed')}</PanelTitle>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t('edit.tools.speed')}>
        {SPEEDS.map((s) => (
          <button
            key={s} type="button" role="radio" aria-checked={ops.speed === s} onClick={() => set({ speed: s })} data-testid={`speed-${s}`}
            className={`h-9 rounded-md border text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              ops.speed === s ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}
          >
            {s}×
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{t('edit.speed.hint')}</p>
    </div>
  );
}

export function AudioPanel({ info, ops, set, t }) {
  if (!info.has_audio) return (<div><PanelTitle>{t('edit.tools.audio')}</PanelTitle><p className="text-xs text-muted-foreground">{t('edit.audio.none')}</p></div>);
  const edited = ops.volume !== 1 || ops.mute || ops.fadeIn > 0 || ops.fadeOut > 0;
  return (
    <div className="space-y-5">
      <PanelTitle onReset={edited ? () => set({ volume: 1, mute: false, fadeIn: 0, fadeOut: 0 }) : null} resetLabel={t('edit.reset')}>{t('edit.tools.audio')}</PanelTitle>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1.5">
          {ops.mute ? <VolumeX className="w-4 h-4" aria-hidden="true" /> : <Volume2 className="w-4 h-4" aria-hidden="true" />}
          {t('edit.audio.mute')}
        </span>
        <Switch checked={ops.mute} onCheckedChange={(v) => set({ mute: v })} aria-label={t('edit.audio.mute')} data-testid="audio-mute" />
      </div>
      <Field label={t('edit.audio.volume')} value={`${Math.round(ops.volume * 100)}%`} testId="audio-volume">
        <Slider min={0} max={200} step={5} value={[Math.round(ops.volume * 100)]} disabled={ops.mute} onValueChange={([v]) => set({ volume: v / 100 })} aria-label={t('edit.audio.volume')} />
        {ops.volume > 1 && <p className="text-[11px] text-muted-foreground">{t('edit.audio.previewNote')}</p>}
      </Field>
      <Field label={t('edit.audio.fadeIn')} value={`${ops.fadeIn.toFixed(1)} s`} testId="audio-fade-in">
        <Slider min={0} max={50} step={1} value={[Math.round(ops.fadeIn * 10)]} disabled={ops.mute} onValueChange={([v]) => set({ fadeIn: v / 10 })} aria-label={t('edit.audio.fadeIn')} />
      </Field>
      <Field label={t('edit.audio.fadeOut')} value={`${ops.fadeOut.toFixed(1)} s`} testId="audio-fade-out">
        <Slider min={0} max={50} step={1} value={[Math.round(ops.fadeOut * 10)]} disabled={ops.mute} onValueChange={([v]) => set({ fadeOut: v / 10 })} aria-label={t('edit.audio.fadeOut')} />
      </Field>
    </div>
  );
}
