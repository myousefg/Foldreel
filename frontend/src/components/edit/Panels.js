import {
  FlipHorizontal2, FlipVertical2, Plus, RotateCcw, RotateCw, Trash2, Volume2, VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  ASPECTS, DEFAULT_OPS, LOOKS, NEW_TEXT, SPEEDS, activeLook, aspectCrop, cssFilter, outputSize, turnedSize,
} from '@/lib/editOps';

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
    <div className="flex items-center justify-between mb-4 min-h-7">
      <h2 className="text-[13px] font-semibold">{children}</h2>
      {onReset && (
        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={onReset}>{resetLabel}</Button>
      )}
    </div>
  );
}

export function CropPanel({ info, ops, set, aspect, setAspect, t }) {
  const turned = turnedSize(info, ops);
  const out = outputSize(info, { ...ops, height: null });
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
    </div>
  );
}

// One-tap looks, each shown on the real picture.
export function LooksPanel({ ops, set, poster, t }) {
  const current = activeLook(ops);
  return (
    <div>
      <PanelTitle onReset={current !== 'none' ? () => set({ tone: 'none', brightness: 0, contrast: 0, saturation: 0 }) : null} resetLabel={t('edit.reset')}>{t('edit.tools.looks')}</PanelTitle>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('edit.tools.looks')}>
        {LOOKS.map((l) => (
          <button
            key={l.id} type="button" role="radio" aria-checked={current === l.id} data-testid={`look-${l.id}`}
            onClick={() => set({ tone: l.tone, brightness: l.brightness, contrast: l.contrast, saturation: l.saturation })}
            className={`group text-start rounded-lg overflow-hidden border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              current === l.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-muted-foreground/50'}`}
          >
            <span className="block aspect-[4/3] bg-muted overflow-hidden">
              <img src={poster} alt="" draggable={false} className="w-full h-full object-cover" style={{ filter: cssFilter({ ...DEFAULT_OPS, ...l }) }} />
            </span>
            <span className="block px-2 py-1.5 text-[11px] font-medium">{t(`edit.look.${l.id}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const pctText = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;

export function AdjustPanel({ kind, ops, set, t }) {
  const edited = ops.brightness !== 0 || ops.contrast !== 0 || ops.saturation !== 0 || ops.tone !== 'none';
  return (
    <div className="space-y-5">
      <PanelTitle onReset={edited ? () => set({ tone: 'none', brightness: 0, contrast: 0, saturation: 0 }) : null} resetLabel={t('edit.reset')}>{t('edit.tools.adjust')}</PanelTitle>
      {[['brightness', 'edit.adjust.brightness'], ['contrast', 'edit.adjust.contrast'], ['saturation', 'edit.adjust.saturation']].map(([key, label]) => (
        <Field key={key} label={t(label)} value={pctText(ops[key])} testId={`adjust-${key}`}>
          <Slider min={-100} max={100} step={1} value={[Math.round(ops[key] * 100)]} onValueChange={([v]) => set({ [key]: v / 100 })} aria-label={t(label)} />
        </Field>
      ))}
      {kind === 'video' && (
        <>
          <div className="border-t border-border pt-4 space-y-5">
            <Field label={t('edit.adjust.fadeIn')} value={`${ops.vFadeIn.toFixed(1)} s`} testId="vfade-in">
              <Slider min={0} max={50} step={1} value={[Math.round(ops.vFadeIn * 10)]} onValueChange={([v]) => set({ vFadeIn: v / 10 })} aria-label={t('edit.adjust.fadeIn')} />
            </Field>
            <Field label={t('edit.adjust.fadeOut')} value={`${ops.vFadeOut.toFixed(1)} s`} testId="vfade-out">
              <Slider min={0} max={50} step={1} value={[Math.round(ops.vFadeOut * 10)]} onValueChange={([v]) => set({ vFadeOut: v / 10 })} aria-label={t('edit.adjust.fadeOut')} />
            </Field>
          </div>
        </>
      )}
    </div>
  );
}

const SWATCHES = ['#ffffff', '#000000', '#ffd60a', '#ff453a', '#ff6bb5', '#64d2ff', '#32d74b'];

export function TextPanel({ ops, set, sel, setSel, t }) {
  const texts = ops.texts;
  const cur = texts[sel];
  const patch = (i, p) => set({ texts: texts.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const add = () => {
    if (texts.length >= 6) return;
    set({ texts: [...texts, { ...NEW_TEXT, text: t('edit.text.sample') }] });
    setSel(texts.length);
  };
  const remove = (i) => {
    set({ texts: texts.filter((_, k) => k !== i) });
    setSel(Math.max(0, Math.min(sel, texts.length - 2)));
  };
  return (
    <div className="space-y-4">
      <PanelTitle>{t('edit.tools.text')}</PanelTitle>
      <Button variant="outline" size="sm" className="w-full" onClick={add} disabled={texts.length >= 6} data-testid="text-add">
        <Plus className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('edit.text.add')}
      </Button>
      {texts.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('edit.tools.text')}>
          {texts.map((x, i) => (
            <button
              key={i} type="button" role="tab" aria-selected={sel === i} onClick={() => setSel(i)}
              className={`h-7 max-w-[110px] truncate rounded-md border px-2 text-[11px] ${sel === i ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}
            >
              {x.text.trim() || t('edit.text.empty')}
            </button>
          ))}
        </div>
      )}
      {cur && (
        <div className="space-y-4" data-testid="text-editor">
          <textarea
            value={cur.text} onChange={(e) => patch(sel, { text: e.target.value })} rows={2} maxLength={200}
            aria-label={t('edit.text.content')} data-testid="text-input"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Field label={t('edit.text.size')} value={`${Math.round(cur.size * 100)}%`} testId="text-size">
            <Slider min={2} max={30} step={1} value={[Math.round(cur.size * 100)]} onValueChange={([v]) => patch(sel, { size: v / 100 })} aria-label={t('edit.text.size')} />
          </Field>
          <Field label={t('edit.text.color')}>
            <div className="flex items-center gap-1.5 flex-wrap">
              {SWATCHES.map((c) => (
                <button
                  key={c} type="button" onClick={() => patch(sel, { color: c })} aria-label={c} aria-pressed={cur.color === c}
                  className={`w-6 h-6 rounded-full border ${cur.color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'border-border'}`}
                  style={{ background: c }}
                />
              ))}
              <Input type="color" value={cur.color} onChange={(e) => patch(sel, { color: e.target.value })} aria-label={t('edit.text.color')} className="w-8 h-7 p-0.5 cursor-pointer" />
            </div>
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{t('edit.text.box')}</span>
            <Switch checked={cur.box} onCheckedChange={(v) => patch(sel, { box: v })} aria-label={t('edit.text.box')} />
          </div>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive -ms-2" onClick={() => remove(sel)} data-testid="text-remove">
            <Trash2 className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('edit.text.remove')}
          </Button>
        </div>
      )}
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
