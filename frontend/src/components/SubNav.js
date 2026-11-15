import { useI18n } from '@/context/I18nProvider';
import { sentenceCase } from '@/lib/utils';

// A category list on the left, the chosen category's content on the right.
// tabs: [[key, label], ...]
export default function SubNav({ tabs, value, onChange, label, children }) {
  const { lang } = useI18n();
  return (
    <div className="flex gap-10">
      <nav className="w-44 shrink-0 sticky top-0 self-start space-y-0.5" aria-label={label}>
        {tabs.map(([key, text]) => (
          <button
            key={key} type="button" onClick={() => onChange(key)} aria-current={value === key ? 'page' : undefined}
            className={`w-full text-start px-3 h-8 rounded-md text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              value === key ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            }`}
          >
            {sentenceCase(text, lang)}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-w-0 max-w-2xl space-y-8">{children}</div>
    </div>
  );
}
