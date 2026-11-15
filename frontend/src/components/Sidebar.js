import { NavLink } from 'react-router-dom';
import { ArrowDownToLine, Library, Settings, KeyRound, SlidersHorizontal, Bell, ArrowLeftRight, FolderTree } from 'lucide-react';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';
import { sentenceCase } from '@/lib/utils';

const linkClass = ({ isActive }) =>
  `flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    isActive
      ? 'bg-[hsl(var(--sidebar-accent))] text-foreground font-medium'
      : 'text-muted-foreground hover:bg-[hsl(var(--sidebar-accent))]/60 hover:text-foreground'
  }`;

function NavItem({ to, icon: Icon, label, end, badge, testId }) {
  return (
    <NavLink to={to} end={end} className={linkClass} data-testid={testId}>
      <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="truncate">{label}</span>
      {badge}
    </NavLink>
  );
}

export default function Sidebar() {
  const { t, lang } = useI18n();
  const { connected, active } = useJobs();
  const label = (key) => sentenceCase(t(key), lang);

  const badge = active.length > 0 && (
    <span
      className="ms-auto text-[11px] font-medium tabular-nums text-primary"
      aria-label={t('nav.activeCount', { count: active.length })}
    >
      {active.length}
    </span>
  );

  return (
    <aside
      className="w-52 shrink-0 flex flex-col bg-[hsl(var(--sidebar-background))] border-r border-[hsl(var(--sidebar-border))]"
      data-testid="sidebar"
    >
      <div className="flex items-center gap-2 h-14 px-4 shrink-0">
        <img src={`${process.env.PUBLIC_URL}/icon.png`} alt="" width="22" height="22" className="w-[22px] h-[22px] rounded-[5px]" />
        <span className="text-sm font-semibold tracking-tight">Foldreel</span>
      </div>

      <nav className="flex-1 px-2.5 space-y-0.5" aria-label={t('nav.mainNav')} data-testid="sidebar-nav">
        <NavItem to="/" end icon={ArrowDownToLine} label={label('nav.dashboard')} badge={badge} testId="nav-dashboard" />
        <NavItem to="/history" icon={Library} label={label('nav.history')} testId="nav-history" />
        <NavItem to="/watch" icon={Bell} label={label('nav.watch')} testId="nav-watch" />
        <div className="h-3" aria-hidden="true" />
        <NavItem to="/convert" icon={ArrowLeftRight} label={label('nav.convert')} testId="nav-convert" />
        <NavItem to="/organize" icon={FolderTree} label={label('nav.organize')} testId="nav-organize" />
      </nav>

      <div className="px-2.5 pb-3 space-y-0.5">
        <NavItem to="/sites" icon={KeyRound} label={label('nav.sites')} testId="nav-sites" />
        <NavItem to="/advanced" icon={SlidersHorizontal} label={label('nav.advanced')} testId="nav-advanced" />
        <NavItem to="/settings" icon={Settings} label={label('nav.settings')} testId="nav-settings" />
        <div className="flex items-center gap-2 px-2.5 pt-3 text-[11px] text-muted-foreground" role="status">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} aria-hidden="true" />
          {connected ? t('nav.connected') : t('nav.offline')}
        </div>
      </div>
    </aside>
  );
}
