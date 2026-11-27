import { createContext, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';

// The sticky header bar belongs to Layout, but what goes in it (a page's actions,
// a one-line summary) belongs to the page. Layout publishes the two slot elements
// here and pages render into them with <PageActions> / <PageSubtitle>.
export const HeaderSlots = createContext({ actions: null, subtitle: null, setWide: () => {} });

export function PageActions({ children }) {
  const { actions } = useContext(HeaderSlots);
  return actions ? createPortal(children, actions) : null;
}

// A page that turns into a full-window workspace (the editor, once a file is open) asks for the wide
// layout while it is one; the page around an empty state keeps the normal column.
export function useWideLayout(wide) {
  const { setWide } = useContext(HeaderSlots);
  useEffect(() => {
    setWide(!!wide);
    return () => setWide(false);
  }, [wide, setWide]);
}

export function PageSubtitle({ children }) {
  const { subtitle } = useContext(HeaderSlots);
  return subtitle ? createPortal(children, subtitle) : null;
}
