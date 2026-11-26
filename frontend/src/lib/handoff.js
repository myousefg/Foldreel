// Files picked on one page (the Library) that another page (Convert, Organize)
// should start with. Read once, by the page that asked for them.
let pending = null;

export const handoff = {
  set(target, paths) { pending = { target, paths: [...paths] }; },
  take(target) {
    if (!pending || pending.target !== target) return null;
    const { paths } = pending;
    pending = null;
    return paths;
  },
};
