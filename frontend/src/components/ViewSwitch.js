import { LayoutList, Maximize2, Rows3 } from 'lucide-react';
import { Segmented } from '@/components/kit';
import { useI18n } from '@/context/I18nProvider';

// List, medium or large pictures: how much of each file to show.
export const VIEW_BOX = {
  list: { box: 32, fetch: 320 },
  medium: { box: 112, fetch: 320 },
  large: { box: 260, fetch: 640 },
};

export function loadView(key, fallback = 'medium') {
  try {
    const v = localStorage.getItem(key);
    return VIEW_BOX[v] ? v : fallback;
  } catch { return fallback; }
}

export function saveView(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

export default function ViewSwitch({ value, onChange }) {
  const { t } = useI18n();
  const item = (Icon, key) => (
    <span className="inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" aria-hidden="true" />{t(`organize.view.${key}`)}</span>
  );
  return (
    <Segmented
      label={t('organize.viewLabel')} value={value} onChange={onChange}
      options={[
        { value: 'list', label: item(Rows3, 'list') },
        { value: 'medium', label: item(LayoutList, 'medium') },
        { value: 'large', label: item(Maximize2, 'large') },
      ]}
    />
  );
}
