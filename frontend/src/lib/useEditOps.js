import { useCallback, useRef, useState } from 'react';
import { DEFAULT_OPS } from '@/lib/editOps';

/**
 * The edits, with undo and redo. Changes to the same setting made in quick succession (dragging a
 * slider) count as one step.
 */
export function useEditOps() {
  const [state, setState] = useState({ past: [], now: DEFAULT_OPS, future: [] });
  const last = useRef({ key: '', at: 0 });

  const set = useCallback((patch) => {
    const key = Object.keys(patch).sort().join(',');
    const at = Date.now();
    const merge = key === last.current.key && at - last.current.at < 700;
    last.current = { key, at };
    setState((s) => ({
      past: merge ? s.past : [...s.past.slice(-49), s.now],
      now: { ...s.now, ...patch },
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    last.current = { key: '', at: 0 };
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), now: s.past[s.past.length - 1], future: [s.now, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    last.current = { key: '', at: 0 };
    setState((s) => (s.future.length ? { past: [...s.past, s.now], now: s.future[0], future: s.future.slice(1) } : s));
  }, []);

  /** Back to an untouched picture. A fresh file starts with no history; "Reset" can be undone. */
  const reset = useCallback((keepHistory = true) => {
    last.current = { key: '', at: 0 };
    setState((s) => (keepHistory ? { past: [...s.past.slice(-49), s.now], now: DEFAULT_OPS, future: [] } : { past: [], now: DEFAULT_OPS, future: [] }));
  }, []);

  return { ops: state.now, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
