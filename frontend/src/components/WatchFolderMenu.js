import { Check, ChevronDown, Folder, FolderSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/context/I18nProvider';
import { isElectron } from '@/lib/electron';

const tail = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(p || '');

/**
 * Where a watch saves what it finds: the normal download folder, a folder used by another watch, or
 * any folder picked from disk. `value` is a path, or '' for the normal folder.
 */
export default function WatchFolderMenu({ value, onChange, known = [], defaultDir = '', className = '', testId }) {
  const { t } = useI18n();
  const others = [...new Set(known.filter((p) => p && p !== value))];

  const choose = async () => {
    if (!isElectron) return;
    const picked = await window.electronAPI.selectFolder({ title: t('watch.chooseFolder'), defaultPath: value || defaultDir || undefined });
    if (picked) onChange(picked);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline" size="sm" data-testid={testId} title={value || defaultDir}
          className={`h-8 max-w-[200px] gap-1.5 text-xs ${className}`} aria-label={`${t('watch.saveTo')}: ${value || t('watch.defaultFolder')}`}
        >
          <Folder className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{value ? tail(value) : t('watch.defaultFolder')}</span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem onSelect={() => onChange('')} data-testid="watch-folder-default" className="flex items-start gap-2 py-2">
          <Check className={`w-4 h-4 mt-0.5 shrink-0 ${value ? 'opacity-0' : ''}`} aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-[13px]">{t('watch.defaultFolder')}</span>
            {defaultDir && <span className="block text-[11px] text-muted-foreground font-mono truncate" title={defaultDir}>{defaultDir}</span>}
          </span>
        </DropdownMenuItem>
        {value && (
          <DropdownMenuItem onSelect={() => onChange(value)} className="flex items-start gap-2 py-2">
            <Check className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[13px] truncate">{tail(value)}</span>
              <span className="block text-[11px] text-muted-foreground font-mono truncate" title={value}>{value}</span>
            </span>
          </DropdownMenuItem>
        )}
        {others.map((p) => (
          <DropdownMenuItem key={p} onSelect={() => onChange(p)} className="flex items-start gap-2 py-2">
            <Check className="w-4 h-4 mt-0.5 shrink-0 opacity-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[13px] truncate">{tail(p)}</span>
              <span className="block text-[11px] text-muted-foreground font-mono truncate" title={p}>{p}</span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={choose} disabled={!isElectron} data-testid="watch-folder-choose" className="gap-2">
          <FolderSearch className="w-4 h-4" aria-hidden="true" /> {t('watch.chooseFolder')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
