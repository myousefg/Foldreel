import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Section, Row } from '@/components/settingsUi';
import { Segmented } from '@/components/kit';
import { useI18n } from '@/context/I18nProvider';
import { useSettings } from '@/context/SettingsProvider';

// What each setting is when the app is new.
const DEFAULTS = {
  max_concurrent: 2, default_range: '', skip_existing: true, write_metadata: false,
  rate_limit: '', sleep_request: 0, retries: 4, proxy: '',
};

const PARALLEL = [1, 2, 3, 4, 6, 8];
const SPEEDS = ['', '500K', '1M', '2M', '5M', '10M', '20M'];
const DELAYS = [0, 0.5, 1, 2, 5];
const RETRIES = [0, 1, 2, 4, 8, 12];
const LIMITS = ['', '10', '25', '50', '100', '200'];

const speedText = (v, t) => {
  if (!v) return t('engine.unlimited');
  const m = /^(\d+(?:\.\d+)?)\s*([kKmMgG])?/.exec(v);
  if (!m) return v;
  const unit = { k: 'KB', m: 'MB', g: 'GB' }[(m[2] || 'm').toLowerCase()];
  return t('engine.perSecond', { size: `${m[1]} ${unit}` });
};

// A dropdown of the usual choices, plus whatever is saved now if it is not one of them.
// (An empty value is not allowed as a menu value, so "no limit" travels as a word.)
const toMenu = (v) => (v === '' ? '__none' : String(v));
const fromMenu = (v) => (v === '__none' ? '' : v);
function Choice({ value, options, label, onChange, testId }) {
  const items = options.some((o) => String(o.value) === String(value)) ? options : [...options, { value, label: String(value) }];
  return (
    <Select value={toMenu(value)} onValueChange={(v) => onChange(fromMenu(v))}>
      <SelectTrigger className="w-40 h-8 text-xs" data-testid={testId}><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        {items.map((o) => <SelectItem key={toMenu(o.value)} value={toMenu(o.value)}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// "Everything", a few round numbers, or a range typed by hand.
function LimitField({ value, onChange }) {
  const { t } = useI18n();
  const preset = LIMITS.includes(value || '');
  const [custom, setCustom] = useState(!preset);
  const showCustom = custom || !preset;
  return (
    <div className="flex items-center gap-2">
      {showCustom && (
        <Input
          value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={t('engine.customPlaceholder')}
          className="w-28 h-8 font-mono text-xs" aria-label={t('engine.limit')} data-testid="engine-limit-custom"
        />
      )}
      <Select
        value={showCustom ? 'custom' : (value || 'all')}
        onValueChange={(v) => {
          if (v === 'custom') { setCustom(true); return; }
          setCustom(false);
          onChange(v === 'all' ? '' : v);
        }}
      >
        <SelectTrigger className="w-36 h-8 text-xs" data-testid="engine-limit"><SelectValue /></SelectTrigger>
        <SelectContent>
          {LIMITS.map((l) => <SelectItem key={l || 'all'} value={l || 'all'}>{l ? t('engine.newest', { n: l }) : t('engine.everything')}</SelectItem>)}
          <SelectItem value="custom">{t('engine.custom')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default function EnginePanel() {
  const { t } = useI18n();
  const { settings: s, update } = useSettings();
  const paused = Number(s.max_concurrent ?? 2) === 0;
  const current = Number(s.max_concurrent ?? 2);
  const parallelOptions = [...new Set([...(paused ? [0] : []), ...PARALLEL, current])]
    .sort((x, y) => x - y)
    .map((n) => ({ value: n, label: n === 0 ? t('engine.paused') : String(n) }));

  const reset = async () => {
    await update(DEFAULTS);
    toast.success(t('engine.resetDone'));
  };

  return (
    <>
      <Section label={t('engine.speed')}>
        <Row title={t('engine.parallel')} desc={t('engine.parallelDesc')}>
          <Segmented
            label={t('engine.parallel')} value={current} onChange={(v) => update({ max_concurrent: v })}
            options={parallelOptions}
          />
        </Row>
        {paused && (
          <div className="flex items-center gap-3 px-3 py-3 bg-amber-500/10 text-xs" role="status" data-testid="engine-paused">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
            <span className="flex-1">{t('engine.pausedNote')}</span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => update({ max_concurrent: 2 })}>{t('engine.resume')}</Button>
          </div>
        )}
        <Row title={t('engine.speedLimit')}>
          <Choice
            value={s.rate_limit || ''} label={t('engine.unlimited')} testId="engine-speed"
            options={SPEEDS.map((v) => ({ value: v, label: speedText(v, t) }))}
            onChange={(v) => update({ rate_limit: v })}
          />
        </Row>
        <Row title={t('engine.delay')} desc={t('engine.delayDesc')}>
          <Choice
            value={Number(s.sleep_request ?? 0)} label={t('engine.off')} testId="engine-delay"
            options={DELAYS.map((v) => ({ value: v, label: v ? t('engine.seconds', { n: v }) : t('engine.off') }))}
            onChange={(v) => update({ sleep_request: Number(v) })}
          />
        </Row>
        <Row title={t('engine.retries')}>
          <Choice
            value={Number(s.retries ?? 4)} label="4" testId="engine-retries"
            options={RETRIES.map((v) => ({ value: v, label: v ? t('engine.times', { n: v }) : t('engine.never') }))}
            onChange={(v) => update({ retries: Number(v) })}
          />
        </Row>
      </Section>

      <Section label={t('engine.downloads')}>
        <Row title={t('engine.limit')} desc={t('engine.limitDesc')}>
          <LimitField value={s.default_range || ''} onChange={(v) => update({ default_range: v })} />
        </Row>
        <Row title={t('engine.skip')} desc={t('settings.skipExistingDesc')}>
          <Switch checked={!!s.skip_existing} onCheckedChange={(v) => update({ skip_existing: v })} data-testid="skip-existing" />
        </Row>
        <Row title={t('engine.saveInfo')} desc={t('engine.saveInfoDesc')}>
          <Switch checked={!!s.write_metadata} onCheckedChange={(v) => update({ write_metadata: v })} data-testid="engine-metadata" />
        </Row>
      </Section>

      <Section label={t('engine.network')}>
        <Row title={t('engine.proxy')} desc={t('engine.proxyDesc')}>
          <Input
            value={s.proxy || ''} onChange={(e) => update({ proxy: e.target.value })}
            placeholder="socks5://127.0.0.1:1080" className="w-64 h-8 font-mono text-xs" data-testid="proxy"
          />
        </Row>
      </Section>

      <div className="flex items-center justify-between px-3 pt-1">
        <span />
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={reset} data-testid="engine-reset">
          <RotateCcw className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('engine.reset')}
        </Button>
      </div>
    </>
  );
}
