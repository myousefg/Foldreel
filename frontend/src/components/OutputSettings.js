import { FolderOpen, Braces } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/context/I18nProvider';
import { useSettings } from '@/context/SettingsProvider';
import { isElectron } from '@/lib/electron';

const FOLDER_STRUCTURES = ['site_user', 'site', 'flat', 'custom'];

// gallery-dl format fields offered by the "Insert field" menus. Exported for
// reuse anywhere else a gallery-dl template string gets typed by hand (the
// Presets editor, since a preset's overrides can set the same
// filename/directory keys).
export const NAME_TOKENS = ['category', 'id', 'num', 'filename', 'extension', 'title', 'date', 'user'];
export const NAME_TOKEN_TEXT = {
  category: '{category}', id: '{id}', num: '{num}', filename: '{filename}',
  extension: '{extension}', title: '{title}', date: '{date:%Y%m%d}', user: '{user[name]}',
};
export const PATH_TOKENS = ['category', 'user', 'subcategory', 'date', 'type'];
export const PATH_TOKEN_TEXT = {
  category: '{category}', user: '{user[name]}', subcategory: '{subcategory}', date: '{date:%Y-%m}',
  type: '{type}',
};

export function TokenMenu({ tokens, text, onPick }) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title={t('settings.tokens.insert')} aria-label={t('settings.tokens.insert')}>
          <Braces className="w-4 h-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {tokens.map(k => (
          <DropdownMenuItem
            key={k}
            onSelect={() => onPick(text[k])}
            className="flex flex-col items-start gap-0.5 py-1.5"
          >
            <code className="text-xs">{text[k]}</code>
            <span className="text-[11px] text-muted-foreground">{t(`settings.tokens.${k}`)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Field({ label, children }) {
  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// Where files go and what they are called. Lives in the composer's popover so
// the Downloads page isn't a settings form.
export function OutputFields() {
  const { t } = useI18n();
  const { settings: s, update } = useSettings();
  if (!s) return null;

  const browseFolder = async () => {
    if (!isElectron) return;
    const p = await window.electronAPI.selectFolder({ title: t('settings.outputDir'), defaultPath: s.output_dir });
    if (p) update({ output_dir: p });
  };

  const addToken = (key, token, sep = '') => {
    const cur = s[key] || '';
    const glue = cur && sep && !cur.endsWith(sep) ? sep : '';
    update({ [key]: cur + glue + token });
  };

  return (
    <div className="space-y-4 w-[min(380px,80vw)]">
      <Field label={t('settings.outputDir')}>
        <div className="flex gap-2">
          <Input
            value={s.output_dir || ''} onChange={e => update({ output_dir: e.target.value })}
            title={s.output_dir || ''} aria-label={t('settings.outputDir')}
            className="font-mono text-xs" data-testid="output-dir"
          />
          {isElectron && (
            <Button variant="outline" size="icon" className="shrink-0" onClick={browseFolder} title={t('settings.browse')} aria-label={t('settings.browse')}>
              <FolderOpen className="w-4 h-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </Field>

      <Field label={t('settings.folderStructure')}>
        <Select value={s.folder_structure || 'site_user'} onValueChange={v => update({ folder_structure: v })}>
          <SelectTrigger data-testid="folder-structure" aria-label={t('settings.folderStructure')}><SelectValue /></SelectTrigger>
          <SelectContent>
            {FOLDER_STRUCTURES.map(f => <SelectItem key={f} value={f}>{t(`settings.fs.${f}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      {s.folder_structure === 'custom' && (
        <Field label={t('settings.folderCustom')}>
          <div className="flex gap-2">
            <Input
              value={s.folder_custom || ''} onChange={e => update({ folder_custom: e.target.value })}
              placeholder="{category}/{user[name]}" aria-label={t('settings.folderCustom')} className="font-mono text-xs"
            />
            <TokenMenu tokens={PATH_TOKENS} text={PATH_TOKEN_TEXT} onPick={tok => addToken('folder_custom', tok, '/')} />
          </div>
          <p className="text-xs text-muted-foreground">{t('settings.folderCustomDesc')}</p>
        </Field>
      )}

      <Field label={t('settings.filenameFormat')}>
        <div className="flex gap-2">
          <Input
            value={s.filename_format || ''} onChange={e => update({ filename_format: e.target.value })}
            placeholder="{category}_{id}.{extension}" aria-label={t('settings.filenameFormat')} className="font-mono text-xs"
          />
          <TokenMenu tokens={NAME_TOKENS} text={NAME_TOKEN_TEXT} onPick={tok => addToken('filename_format', tok)} />
        </div>
      </Field>
    </div>
  );
}
