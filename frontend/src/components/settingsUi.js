// Shared layout primitives for the settings-style rows used on
// Settings, Dashboard (Output), and Sites (Cookies & Auth).

import { useEffect, useId, useRef } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/context/I18nProvider';
import { sentenceCase } from '@/lib/utils';

// A small heading in plain sentence case. Several locale strings are all caps
// ("OUTPUT"); those are normalised here so labels never shout.
export function SectionLabel({ as: Tag = 'h2', className = '', children, ...rest }) {
  const { lang } = useI18n();
  return (
    <Tag className={`text-[13px] font-semibold px-3 ${className}`.trim()} {...rest}>
      {typeof children === 'string' ? sentenceCase(children, lang) : children}
    </Tag>
  );
}

export function Section({ label, children, aside }) {
  const labelId = useId();
  return (
    <section className="space-y-2" aria-labelledby={labelId}>
      <div className="flex items-center justify-between">
        <SectionLabel id={labelId}>{label}</SectionLabel>
        {aside}
      </div>
      <div className="list">{children}</div>
    </section>
  );
}

export function Row({ title, desc, children }) {
  const titleId = useId();
  const rowRef = useRef(null);

  // Rows hold arbitrary controls (switches, inputs, selects), and most of them
  // were rendered with no name of their own, so a screen reader announced a bare
  // "switch" or "edit text". The row title is already the right label: point the
  // row's primary control at it unless it was given a name explicitly.
  useEffect(() => {
    const control = rowRef.current?.querySelector(
      'input:not([type=hidden]), textarea, select, [role=switch], [role=combobox]',
    );
    if (control && !control.hasAttribute('aria-label') && !control.hasAttribute('aria-labelledby') && !control.labels?.length) {
      control.setAttribute('aria-labelledby', titleId);
    }
  });

  return (
    <div ref={rowRef} className="px-3 py-3 flex items-center justify-between gap-6" role="group" aria-labelledby={titleId}>
      <div className="min-w-0 flex items-center gap-1.5">
        <p id={titleId} className="text-sm font-medium truncate">{title}</p>
        {desc && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              {/* p-1.5/-m-1.5 grows the 14px icon to a 26px hit area without moving anything */}
              <button type="button" className="shrink-0 p-1.5 -m-1.5 rounded text-muted-foreground/50 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Info className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="sr-only">{desc}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed" side="top">
              {desc}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}
