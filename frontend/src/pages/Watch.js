import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Bell, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import WatchSection from '@/components/WatchSection';
import { PageSubtitle } from '@/components/PageHeader';
import { useI18n } from '@/context/I18nProvider';
import { useWatches } from '@/lib/watches';

const INTERVALS = [15, 30, 60, 180, 360, 720, 1440];

function isValidUrl(url) {
  try {
    const parsed = new URL((url || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function Watch() {
  const { t } = useI18n();
  const { watches, add, update, remove, checkNow } = useWatches();
  const [url, setUrl] = useState('');
  const [interval, setInterval_] = useState('60');
  const [busy, setBusy] = useState(false);
  const urlInputId = useId();

  const submit = async () => {
    if (!isValidUrl(url)) { toast.error(t('dashboard.invalidUrl')); return; }
    setBusy(true);
    try {
      await add(url.trim(), Number(interval));
      setUrl('');
      toast.success(t('watch.added'));
    } catch {
      toast.error(t('watch.addFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageSubtitle>{t('watch.summary', { count: watches.length })}</PageSubtitle>

      <div className="flex items-center gap-2 flex-wrap rounded-xl border border-border bg-card p-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
        <label htmlFor={urlInputId} className="sr-only">{t('watch.add')}</label>
        <Input
          id={urlInputId}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder={t('dashboard.urlPlaceholder')}
          className="flex-1 min-w-[220px] font-mono text-[13px] border-0 bg-transparent shadow-none focus-visible:ring-0"
          data-testid="watch-url-input"
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
        <Select value={interval} onValueChange={setInterval_}>
          <SelectTrigger className="w-32 h-9 border-0 bg-transparent shadow-none text-muted-foreground" data-testid="watch-interval-select" aria-label={t('watch.interval.60')}><SelectValue /></SelectTrigger>
          <SelectContent>
            {INTERVALS.map(m => <SelectItem key={m} value={String(m)}>{t(`watch.interval.${m}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={submit} disabled={busy || !url.trim()} data-testid="watch-add-btn">
          {busy ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Bell className="w-4 h-4 me-2" />}
          {t('watch.add')}
        </Button>
      </div>

      <WatchSection
        watches={watches}
        onUpdate={update}
        onRemove={remove}
        onCheckNow={checkNow}
        emptyMessage={t('watch.empty')}
      />
    </div>
  );
}
