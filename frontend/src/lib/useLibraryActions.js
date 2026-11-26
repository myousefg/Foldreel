import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { libraryApi } from '@/lib/api';
import { libraryClipboard } from '@/lib/libraryClipboard';

const errText = (e) => e?.response?.data?.detail || e?.message || '';

/**
 * Everything that changes the library: paste, rename, delete, favorites, tags, new folder, undo.
 * The page owns the selection and the listing; it passes in how to refresh them.
 *   deleteMode  'recycle' (no question asked) or 'permanent' (asks first), from Settings.
 */
export function useLibraryActions({ t, deleteMode, refresh, patchItem, onGone }) {
  const undoStack = useRef([]);
  const [pendingDelete, setPendingDelete] = useState(null); // { paths, names, after } while the warning is open

  const pushUndo = useCallback((label, run) => {
    undoStack.current = [...undoStack.current.slice(-9), { label, run }];
    return run;
  }, []);

  const relocateBack = useCallback((moves) => async () => {
    try {
      const r = await libraryApi.relocate(moves.map((m) => ({ from: m.to, to: m.from })));
      if (r.errors.length) toast.error(r.errors[0]); else toast.success(t('library.undone'));
    } catch (e) { toast.error(errText(e) || t('library.actionFailed')); }
    refresh(true);
  }, [t, refresh]);

  const undo = useCallback(async () => {
    const last = undoStack.current.pop();
    if (!last) { toast(t('library.nothingToUndo')); return; }
    await last.run();
  }, [t]);

  const withUndo = useCallback((message, moves) => {
    const run = pushUndo(message, relocateBack(moves));
    toast.success(message, { action: { label: t('common.undo'), onClick: () => { undoStack.current = undoStack.current.filter((u) => u.run !== run); run(); } } });
  }, [pushUndo, relocateBack, t]);

  /** Move or copy into a folder (relative to the download folder; '' is the folder itself). */
  const paste = useCallback(async (op, paths, destRel, newFolder = '') => {
    if (!paths.length) return null;
    try {
      const r = await libraryApi.paste({ op, paths, dest: destRel, new_folder: newFolder });
      if (r.errors.length) toast.error(r.errors[0]);
      if (r.moved.length) {
        if (op === 'copy') toast.success(t('library.copied', { count: r.moved.length }));
        else withUndo(t('library.moved', { count: r.moved.length }), r.moved);
      }
      if (op === 'move') libraryClipboard.clear();
      refresh(true);
      return r;
    } catch (e) {
      toast.error(errText(e) || t('library.moveFailed'));
      return null;
    }
  }, [t, refresh, withUndo]);

  const rename = useCallback(async (entry, name) => {
    const next = name.trim();
    if (!next || next === entry.name) return false;
    try {
      const r = await libraryApi.rename(entry.path, next);
      withUndo(t('library.renamed', { name: r.name }), [{ from: r.from, to: r.to }]);
      refresh(true);
      return true;
    } catch (e) {
      toast.error(e?.response?.status === 409 ? t('library.nameTaken') : (errText(e) || t('library.renameFailed')));
      return false;
    }
  }, [t, refresh, withUndo]);

  const runDelete = useCallback(async (paths, mode, after) => {
    try {
      const r = await libraryApi.remove(paths, mode);
      if (r.errors.length) toast.error(r.errors[0]);
      if (r.deleted.length) {
        toast.success(t(mode === 'permanent' ? 'library.deletedForever' : 'library.deletedToBin', { count: r.deleted.length }));
        onGone?.(r.deleted);
      }
      libraryClipboard.clear();
      refresh(true);
      after?.();
    } catch (e) {
      toast.error(errText(e) || t('library.actionFailed'));
    }
  }, [t, refresh, onGone]);

  /**
   * Delete what is asked for. The Recycle Bin path never asks; deleting for good always does,
   * whether Settings says so or the person chose "Delete permanently" (`forcePermanent`).
   */
  const remove = useCallback((paths, names, { forcePermanent = false, after } = {}) => {
    if (!paths.length) return;
    const mode = forcePermanent || deleteMode === 'permanent' ? 'permanent' : 'recycle';
    if (mode === 'recycle') { runDelete(paths, 'recycle', after); return; }
    setPendingDelete({ paths, names, after });
  }, [deleteMode, runDelete]);

  const confirmDelete = useCallback(() => {
    const p = pendingDelete;
    setPendingDelete(null);
    if (p) runDelete(p.paths, 'permanent', p.after);
  }, [pendingDelete, runDelete]);

  const favorite = useCallback(async (paths, value, loaded = []) => {
    loaded.forEach((p) => patchItem(p, { fav: value }));
    try {
      await libraryApi.favorite(paths, value);
      refresh(false, true);
    } catch (e) {
      loaded.forEach((p) => patchItem(p, { fav: !value }));
      toast.error(errText(e) || t('library.actionFailed'));
    }
  }, [patchItem, refresh, t]);

  const tags = useCallback(async (paths, add, remove_, loaded = []) => {
    const lower = (a) => a.map((x) => x.toLowerCase());
    loaded.forEach((p) => patchItem(p, (it) => {
      const keep = (it.tags || []).filter((x) => !lower(remove_).includes(x.toLowerCase()));
      const have = lower(keep);
      return { tags: [...keep, ...add.filter((x) => !have.includes(x.toLowerCase()))].sort((a, b) => a.localeCompare(b)) };
    }));
    try {
      await libraryApi.tags(paths, add, remove_);
      refresh(false, true);
    } catch (e) {
      toast.error(errText(e) || t('library.actionFailed'));
      refresh(true);
    }
  }, [patchItem, refresh, t]);

  const mkdir = useCallback(async (parentRel) => {
    try {
      const r = await libraryApi.mkdir(parentRel, '');
      refresh(true);
      return r;
    } catch (e) {
      toast.error(errText(e) || t('library.actionFailed'));
      return null;
    }
  }, [t, refresh]);

  return { paste, rename, remove, confirmDelete, pendingDelete, cancelDelete: () => setPendingDelete(null), favorite, tags, mkdir, undo };
}
