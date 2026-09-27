import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Reorder } from 'motion/react';
import {
  Plus, ArrowLeftRight, Undo2, Loader2, Check, ImageIcon, FolderCog, Braces, GripVertical, X, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/context/I18nProvider';
import { organizeApi, organizeThumbUrl } from '@/lib/api';
import { isElectron } from '@/lib/electron';

const DEFAULT_FILE_TEMPLATE = '{name} ({n})';
const DEFAULT_FOLDER_TEMPLATE = '{n}. {originalname_stripped}';
const DEFAULT_TEMPLATES = [DEFAULT_FILE_TEMPLATE, DEFAULT_FOLDER_TEMPLATE];

const RENAME_TOKENS = ['name', 'n', 'sequence', 'originalname', 'originalname_stripped'];
const RENAME_TOKEN_TEXT = {
  name: '{name}', n: '{n}', sequence: '{sequence}',
  originalname: '{originalname}', originalname_stripped: '{originalname_stripped}',
};

// Drops a "12. "/"12-"/"12_"/"12) " prefix some folders already have, so
// renumbering can replace just the number and keep the rest of the name
// intact instead of doubling up ("12. 12. Yae Miko").
function stripLeadingIndex(name) {
  return name.replace(/^\d+[.\-_)]\s*/, '').trim();
}

function bulkRenameName(template, name, n, originalStem) {
  let out = template || DEFAULT_FILE_TEMPLATE;
  out = out.replaceAll('{originalname_stripped}', stripLeadingIndex(originalStem));
  out = out.replaceAll('{originalname}', originalStem);
  out = out.replaceAll('{sequence}', String(n).padStart(3, '0'));
  out = out.replaceAll('{n}', String(n));
  out = out.replaceAll('{name}', name);
  return out.trim() || originalStem;
}

function computeNewName(item, name, template, n) {
  if (item.is_dir) return bulkRenameName(template, name, n, item.name);
  const m = /^(.*)(\.[^.]+)$/.exec(item.name);
  const stem = m ? m[1] : item.name;
  const ext = m ? m[2] : '';
  return bulkRenameName(template, name, n, stem) + ext;
}

function Thumb({ path, isDir }) {
  const [failed, setFailed] = useState(false);
  if (isDir) return <FolderCog className="w-4 h-4 text-muted-foreground" aria-hidden="true" />;
  if (failed) return <ImageIcon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />;
  return (
    <img
      src={organizeThumbUrl(path)} alt="" loading="lazy"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  );
}

function TokenMenu({ onPick }) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title={t('settings.tokens.insert')} aria-label={t('settings.tokens.insert')}>
          <Braces className="w-4 h-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {RENAME_TOKENS.map(k => (
          <DropdownMenuItem key={k} onSelect={() => onPick(RENAME_TOKEN_TEXT[k])} className="flex flex-col items-start gap-0.5 py-1.5">
            <code className="text-xs">{RENAME_TOKEN_TEXT[k]}</code>
            <span className="text-[11px] text-muted-foreground">{t(`organize.token.${k}`)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Organize() {
  const { t } = useI18n();
  const [log, setLog] = useState([]);

  const refreshLog = () => organizeApi.log().then(setLog).catch(() => {});

  useEffect(() => { refreshLog(); }, []);

  const undo = async (id) => {
    try {
      await organizeApi.undo(id);
      toast.success(t('organize.undone'));
      refreshLog();
    } catch {
      toast.error(t('organize.undoFailed'));
    }
  };

  const clearLog = async () => {
    try {
      await organizeApi.clearLog();
      setLog([]);
    } catch {
      toast.error(t('organize.clearFailed'));
    }
  };

  // Bulk rename: pick specific files/folders, drag them into whatever order
  // they should be numbered in, then rename all of them at once - on any
  // folder/files the user hand-picks, often from a personal library that
  // was never a Foldreel download at all.
  const [staged, setStaged] = useState([]); // [{path, name, is_dir}]
  const [renameName, setRenameName] = useState('');
  const [renameTemplate, setRenameTemplate] = useState(DEFAULT_FILE_TEMPLATE);
  const [renameStart, setRenameStart] = useState(1);
  const [renameDragging, setRenameDragging] = useState(false);
  const [renameApplying, setRenameApplying] = useState(false);

  const addStagedPaths = async (paths) => {
    const fresh = paths.filter(p => !staged.some(s => s.path === p));
    if (!fresh.length) return;
    try {
      const { items } = await organizeApi.statPaths(fresh);
      const next = [...staged, ...items];
      setStaged(next);
      // Files read as "give everything one shared name" ({name} (n)) - a
      // folder that already has its own descriptive name reads as "keep the
      // name, just fix the number" instead ({n}. {originalname_stripped}).
      // Only swaps the template while it's still one of the two defaults,
      // so it never overwrites something the user typed themselves.
      const allDirs = next.length > 0 && next.every(it => it.is_dir);
      setRenameTemplate(prev => (
        DEFAULT_TEMPLATES.includes(prev) ? (allDirs ? DEFAULT_FOLDER_TEMPLATE : DEFAULT_FILE_TEMPLATE) : prev
      ));
    } catch {
      toast.error(t('organize.renameAddFailed'));
    }
  };

  const browseStagedItems = async () => {
    if (!isElectron) return;
    const paths = await window.electronAPI.selectFiles({
      title: t('organize.chooseItems'),
      properties: ['openFile', 'openDirectory', 'multiSelections'],
    });
    if (paths?.length) addStagedPaths(paths);
  };

  const onRenameDrop = async (e) => {
    e.preventDefault();
    setRenameDragging(false);
    if (!isElectron) return;
    const files = [...(e.dataTransfer?.files || [])];
    const paths = [];
    for (const f of files) {
      try {
        const p = await window.electronAPI.getPathForFile(f);
        if (p) paths.push(p);
      } catch { /* ignore */ }
    }
    if (paths.length) addStagedPaths(paths);
  };

  const removeStagedItem = (path) => setStaged(prev => prev.filter(it => it.path !== path));
  const insertToken = (token) => setRenameTemplate(prev => (prev ? `${prev} ${token}` : token));

  const applyRename = async () => {
    if (!staged.length) return;
    setRenameApplying(true);
    try {
      const items = staged.map((it, idx) => ({
        path: it.path,
        new_name: computeNewName(it, renameName, renameTemplate, Number(renameStart) + idx),
      }));
      const { applied, errors } = await organizeApi.renameApply(items);
      toast.success(t('organize.renameApplied', { count: applied }));
      if (errors?.length) toast.error(errors[0]);
      setStaged([]);
      refreshLog();
    } catch {
      toast.error(t('organize.renameApplyFailed'));
    } finally {
      setRenameApplying(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <header />

      <section className="space-y-3">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{t('organize.bulkRename')}</h2>

        <div
          className={`border-[1.5px] border-dashed rounded-xl p-6 text-center transition-colors ${renameDragging ? 'border-ring bg-accent/40' : 'border-border'}`}
          onDragOver={e => { e.preventDefault(); setRenameDragging(true); }}
          onDragLeave={() => setRenameDragging(false)}
          onDrop={onRenameDrop}
        >
          <Button variant="outline" size="sm" onClick={browseStagedItems} disabled={!isElectron} data-testid="rename-choose-items-btn">
            <Plus className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('organize.chooseItems')}
          </Button>
        </div>

        {staged.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground h-4 flex items-center">{t('organize.renameName')}</label>
                <Input value={renameName} onChange={e => setRenameName(e.target.value)} data-testid="rename-name-input" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground h-4 flex items-center">{t('organize.renamePattern')}</label>
                <div className="flex items-center gap-2">
                  <Input value={renameTemplate} onChange={e => setRenameTemplate(e.target.value)} className="font-mono text-xs" data-testid="rename-pattern-input" />
                  <TokenMenu onPick={insertToken} />
                </div>
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">{t('organize.renameStart')}</label>
                <Input type="number" min="0" value={renameStart} onChange={e => setRenameStart(e.target.value)} className="w-20" />
              </div>
              <Button size="sm" className="ms-auto" onClick={applyRename} disabled={renameApplying} data-testid="rename-apply-btn">
                {renameApplying ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5 me-1.5" />}
                {t('organize.renameApply', { count: staged.length })}
              </Button>
            </div>

            <Reorder.Group axis="y" values={staged} onReorder={setStaged} className="space-y-2 list-none">
              {staged.map((it, idx) => (
                <Reorder.Item
                  key={it.path} value={it}
                  className="flex items-center gap-3 border border-border rounded-md px-3 py-2.5 surface-elevated cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="text-[11px] text-muted-foreground w-5 text-right shrink-0 font-mono">{Number(renameStart) + idx}</span>
                  <span className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    <Thumb path={it.path} isDir={it.is_dir} />
                  </span>
                  <p className="text-xs font-mono truncate flex-1 min-w-0">
                    {it.name} <ArrowLeftRight className="w-3 h-3 inline mx-1 text-muted-foreground" />
                    <span className="text-foreground">{computeNewName(it, renameName, renameTemplate, Number(renameStart) + idx)}</span>
                  </p>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => removeStagedItem(it.path)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </>
        )}
      </section>

      {log.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{t('organize.recentActivity')}</h2>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearLog}>
              <Trash2 className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('organize.clear')}
            </Button>
          </div>
          <div className="space-y-2">
            {log.slice(0, 20).map(entry => (
              <div key={entry.id} className="flex items-center gap-3 border border-border rounded-md px-3 py-2.5 surface-elevated">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono truncate">{entry.original_name} <ArrowLeftRight className="w-3 h-3 inline mx-1 text-muted-foreground" /> {entry.new_name}</p>
                </div>
                {entry.undone ? (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0"><Check className="w-3 h-3" /> {t('organize.undone')}</span>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => undo(entry.id)}>
                    <Undo2 className="w-3 h-3 me-1" /> {t('common.undo')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
