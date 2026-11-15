import { forwardRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn, sentenceCase } from '@/lib/utils';
import { useI18n } from '@/context/I18nProvider';
import { hueFor, parseSource } from '@/lib/jobMeta';
import { brandFor, faviconFor, glyphOn } from '@/lib/brands';
import { thumbUrl } from '@/lib/api';

// The site's own mark on its brand colour; sites without one get a lettered tile whose hue
// comes from the name, so a source looks the same in the queue, the library and the inspector.
export function SiteAvatar({ url, host: hostProp, size = 36, className = '' }) {
  const { name, host } = parseSource(url || `https://${hostProp}`);
  const [iconFailed, setIconFailed] = useState(false);
  const brand = brandFor(hostProp || host);
  const radius = Math.max(6, Math.round(size * 0.24));
  if (brand) {
    return (
      <span
        aria-hidden="true"
        className={cn('shrink-0 inline-flex items-center justify-center ring-1 ring-inset ring-black/10 dark:ring-white/10', className)}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: `#${brand.hex}`, color: glyphOn(brand.hex) }}
      >
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} fill="currentColor"><path d={brand.path} /></svg>
      </span>
    );
  }
  const favicon = faviconFor(hostProp || host);
  if (favicon && !iconFailed) {
    return (
      <span
        aria-hidden="true"
        className={cn('shrink-0 inline-flex items-center justify-center bg-white ring-1 ring-inset ring-black/10', className)}
        style={{ width: size, height: size, borderRadius: radius }}
      >
        <img src={favicon} alt="" width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} draggable={false} onError={() => setIconFailed(true)} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn('site-avatar shrink-0 inline-flex items-center justify-center font-semibold uppercase select-none', className)}
      style={{ '--h': hueFor(name), width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.42) }}
    >
      {name.charAt(0)}
    </span>
  );
}

// The job's first picture when it has one, otherwise the site avatar.
export function JobThumb({ url, path, size = 40, thumbRef }) {
  const [failed, setFailed] = useState(false);
  if (path && !failed) {
    return (
      <span ref={thumbRef} className="shrink-0 rounded-lg overflow-hidden bg-muted" style={{ width: size, height: size }}>
        <img src={thumbUrl(path)} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      </span>
    );
  }
  return (
    <span ref={thumbRef} className="shrink-0">
      <SiteAvatar url={url} size={size} />
    </span>
  );
}

export function MissingThumb({ className = '' }) {
  return <ImageOff className={cn('text-muted-foreground', className)} aria-hidden="true" />;
}

const STATUS = {
  queued:   { dot: 'bg-muted-foreground/60', text: 'text-muted-foreground' },
  running:  { dot: 'bg-primary animate-pulse', text: 'text-primary' },
  paused:   { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  done:     { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  error:    { dot: 'bg-destructive', text: 'text-destructive' },
  canceled: { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
};

// Status as a dot plus a word: colour is never the only signal.
export function StatusBadge({ status, children, className = '' }) {
  const { lang } = useI18n();
  const s = STATUS[status] || STATUS.queued;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap', s.text, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} aria-hidden="true" />
      {typeof children === 'string' ? sentenceCase(children, lang) : children}
    </span>
  );
}

// A small control that opens a menu or popover, used for the composer's options.
export const Chip = forwardRef(function Chip({ icon: Icon, children, active = false, className = '', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors',
        'text-muted-foreground hover:text-foreground hover:bg-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-accent text-foreground',
        className,
      )}
      {...rest}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
});

// One-of-n filter, announced as a radio group.
export function Segmented({ value, onChange, options, label }) {
  const { lang } = useI18n();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-lg bg-muted">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 px-3 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {typeof o.label === 'string' ? sentenceCase(o.label, lang) : o.label}
          {o.count != null && <span className="ms-1.5 text-muted-foreground font-normal tabular-nums">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// tone="onPrimary" for use inside a filled primary button.
export function Kbd({ children, tone }) {
  return (
    <kbd className={cn(
      'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-mono',
      tone === 'onPrimary'
        ? 'bg-primary-foreground/15 text-primary-foreground/85'
        : 'border border-border bg-muted/60 text-muted-foreground',
    )}>
      {children}
    </kbd>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-14">
      {Icon && (
        <span className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center mb-4">
          <Icon className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {children && <p className="text-sm text-muted-foreground mt-1 max-w-sm leading-relaxed">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
