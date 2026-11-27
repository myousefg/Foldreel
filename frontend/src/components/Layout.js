import { useState } from 'react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { HeaderSlots } from './PageHeader';
import { useI18n } from '@/context/I18nProvider';
import { routeFade } from '@/lib/motion';
import { sentenceCase } from '@/lib/utils';

// Page titles come from the nav labels, so no new strings are needed in 46 locales.
const PAGE_TITLE_KEYS = {
  '/': 'nav.dashboard', '/library': 'nav.library', '/history': 'nav.history', '/watch': 'nav.watch',
  '/convert': 'nav.convert', '/organize': 'nav.organize', '/settings': 'nav.settings',
  '/advanced': 'nav.advanced', '/sites': 'nav.sites',
};

export default function Layout({ children }) {
  const location = useLocation();
  const { t, lang } = useI18n();
  // Slot elements for the title row; pages render into them via <PageActions> / <PageSubtitle>.
  const [actionsEl, setActionsEl] = useState(null);
  const [subtitleEl, setSubtitleEl] = useState(null);
  const titleKey = PAGE_TITLE_KEYS[location.pathname];
  // The Library is a file explorer: it takes the whole window instead of the centred column.
  const wide = location.pathname === '/library';

  return (
    <HeaderSlots.Provider value={{ actions: actionsEl, subtitle: subtitleEl }}>
      <div className="relative flex h-screen overflow-clip bg-background" data-testid="app-layout">
        <Sidebar />
        {/* layoutScroll tells list animations (drag to reorder) that this box scrolls, so rows do not jump while it does */}
        <motion.main layoutScroll className="relative flex-1 min-w-0 overflow-y-auto overscroll-contain">
          <motion.div
            key={location.pathname}
            initial={routeFade.initial}
            animate={routeFade.animate}
            transition={routeFade.transition}
            className={wide ? 'px-6 pt-5 pb-0 w-full' : 'px-10 pt-7 pb-16 max-w-5xl mx-auto w-full'}
          >
            <header className={`flex items-center gap-4 min-h-9 ${wide ? 'mb-3' : 'mb-6'}`}>
              {titleKey && (
                <h1 className="text-xl font-semibold tracking-tight truncate">
                  {sentenceCase(t(titleKey), lang)}
                </h1>
              )}
              <div ref={setSubtitleEl} className="text-xs text-muted-foreground truncate empty:hidden" />
              <div ref={setActionsEl} className="ms-auto flex items-center gap-2 shrink-0" />
            </header>
            {children}
          </motion.div>
        </motion.main>
      </div>
    </HeaderSlots.Provider>
  );
}
