import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

// The sticky header bar belongs to Layout, but what goes in it (a page's actions,
// a one-line summary) belongs to the page. Layout publishes the two slot elements
// here and pages render into them with <PageActions> / <PageSubtitle>.
export const HeaderSlots = createContext({ actions: null, subtitle: null });

export function PageActions({ children }) {
  const { actions } = useContext(HeaderSlots);
  return actions ? createPortal(children, actions) : null;
}

export function PageSubtitle({ children }) {
  const { subtitle } = useContext(HeaderSlots);
  return subtitle ? createPortal(children, subtitle) : null;
}
