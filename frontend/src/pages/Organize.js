import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Reorder } from 'motion/react';
import {
  Plus, ArrowRight, Undo2, Loader2, Check, ImageIcon, FolderCog, Braces, GripVertical, X, Trash2,
  ArrowLeftRight, FolderTree,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageActions } from '@/components/PageHeader';
import DropOverlay from '@/components/DropOverlay';
import ViewSwitch, { VIEW_BOX, loadView, saveView } from '@/components/ViewSwitch';
import { handoff } from '@/lib/handoff';
import { useI18n } from '@/context/I18nProvider';
import { organizeApi, organizeThumbUrl } from '@/lib/api';
import { isElectron } from '@/lib/electron';
import { sortPathsByName } from '@/lib/utils';

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

function Thumb({ path, isDir, view }) {
  const [failed, setFailed] = useState(false);
  const { box, fetch } = VIEW_BOX[view];
  const large = view === 'large';
  return (
    <span
      className="shrink-0 rounded-md bg-muted flex items-center justify-center overflow-hidden ring-1 ring-inset ring-border"
      style={{ width: box, height: box }}
    >
      {isDir
        ? <FolderCog className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        : failed
          ? <ImageIcon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          : (
            <img
              src={organizeThumbUrl(path, fetch)} alt="" loading="lazy" draggable={false}
              onError={() => setFailed(true)}
              className={`w-full h-full ${large ? 'object-contain' : 'object-cover'}`}
            />
          )}
    </span>
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
  const [renameApplying, setRenameApplying] = useState(false);
  const [view, setView] = useState(() => loadView('foldreel_organize_view'));
  const changeView = (v) => { setView(v); saveView('foldreel_organize_view', v); };

  const addStagedPaths = async (paths) => {
    const fresh = sortPathsByName(paths.filter(p => !staged.some(s => s.path === p)));
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

  // Files sent here from the Library start the list.
  useEffect(() => {
    const sent = handoff.take('organize');
    if (sent?.length) addStagedPaths(sent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const stacked = view !== 'list';

  return (
    <div
      className="space-y-8"
      onDragOver={e => e.preventDefault()}
      onDrop={onRenameDrop}
    >
      <DropOverlay />
      <PageActions>
        {staged.length > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground" onClick={() => setStaged([])} data-testid="rename-clear-btn">
            <X className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('organize.clearAll')}
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8" onClick={browseStagedItems} disabled={!isElectron} data-testid="rename-choose-items-btn">
          <Plus className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('organize.chooseItems')}
        </Button>
        {staged.length > 0 && (
          <Button size="sm" className="h-8" onClick={applyRename} disabled={renameApplying} data-testid="rename-apply-btn">
            {renameApplying ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <ArrowLeftRight className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />}
            {t('organize.renameApply', { count: staged.length })}
          </Button>
        )}
      </PageActions>

      {staged.length === 0 ? (
        <button
          type="button" onClick={browseStagedItems} disabled={!isElectron}
          className={`w-full rounded-xl border border-dashed py-14 flex flex-col items-center gap-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-border`}
        >
          <span className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <FolderTree className="w-[18px] h-[18px] text-muted-foreground" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium">{t('organize.dropHint')}</span>
        </button>
      ) : (
        <section className="space-y-4" aria-label={t('organize.bulkRename')}>
          <div className="grid grid-cols-[1fr_1.4fr_auto] gap-3 items-end px-3">
            <div className="space-y-1.5">
              <label htmlFor="rename-name" className="col-head">{t('organize.renameName')}</label>
              <Input id="rename-name" value={renameName} onChange={e => setRenameName(e.target.value)} data-testid="rename-name-input" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="rename-pattern" className="col-head">{t('organize.renamePattern')}</label>
              <div className="flex items-center gap-2">
                <Input id="rename-pattern" value={renameTemplate} onChange={e => setRenameTemplate(e.target.value)} className="font-mono text-xs" data-testid="rename-pattern-input" />
                <TokenMenu onPick={insertToken} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="rename-start" className="col-head">{t('organize.renameStart')}</label>
              <Input id="rename-start" type="number" min="0" value={renameStart} onChange={e => setRenameStart(e.target.value)} className="w-20" />
            </div>
          </div>

          <div className="flex items-center justify-between px-3">
            <span className="text-xs text-muted-foreground tabular-nums">{staged.length}</span>
            <ViewSwitch value={view} onChange={changeView} />
          </div>

          <Reorder.Group axis="y" values={staged} onReorder={setStaged} className="list list-none">
            {staged.map((it, idx) => {
              const n = Number(renameStart) + idx;
              const next = computeNewName(it, renameName, renameTemplate, n);
              return (
                <Reorder.Item
                  key={it.path} value={it}
                  className="flex items-center gap-3 bg-background px-3 py-2.5 cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="text-[11px] text-muted-foreground w-6 text-end shrink-0 tabular-nums">{n}</span>
                  <Thumb path={it.path} isDir={it.is_dir} view={view} />
                  {stacked ? (
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs text-muted-foreground truncate" title={it.name}>{it.name}</p>
                      <p className="text-sm font-medium truncate" title={next}>{next}</p>
                    </div>
                  ) : (
                    <p className="text-xs truncate flex-1 min-w-0">
                      <span className="text-muted-foreground">{it.name}</span>
                      <ArrowRight className="w-3 h-3 inline mx-1.5 text-muted-foreground" aria-hidden="true" />
                      <span>{next}</span>
                    </p>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => removeStagedItem(it.path)} title={t('convert.remove')} aria-label={t('convert.remove')}>
                    <X className="w-4 h-4" />
                  </Button>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
          <button
            type="button" onClick={browseStagedItems} disabled={!isElectron}
            className="w-full h-11 rounded-lg border border-dashed border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="organize-add-more"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> {t('organize.addMore')}
          </button>
        </section>
      )}

      {log.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-3">
            <h2 className="text-[13px] font-semibold">{t('organize.recentActivity')}</h2>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={clearLog}>
              <Trash2 className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('organize.clear')}
            </Button>
          </div>
          <div className="list">
            {log.slice(0, 20).map(entry => (
              <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                <p className="text-xs truncate flex-1 min-w-0">
                  <span className="text-muted-foreground">{entry.original_name}</span>
                  <ArrowRight className="w-3 h-3 inline mx-1.5 text-muted-foreground" aria-hidden="true" />
                  {entry.new_name}
                </p>
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
