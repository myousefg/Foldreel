import { useSyncExternalStore } from 'react';

// Cut and Copy in the Library, kept outside React so it survives moving between
// folders (and pages) and so every tile can dim itself when its file is cut.
let state = { op: null, paths: [] };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const libraryClipboard = {
  get: () => state,
  set(op, paths) { state = { op, paths: [...paths] }; emit(); },
  clear() { if (state.op) { state = { op: null, paths: [] }; emit(); } },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

export function useLibraryClipboard() {
  return useSyncExternalStore(libraryClipboard.subscribe, libraryClipboard.get);
}
