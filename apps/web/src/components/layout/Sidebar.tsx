import { NavLink } from 'react-router-dom';
import {
  Brain,
  LayoutDashboard,
  Database,
  FlaskConical,
  Activity,
  Eye,
  GitCompare,
  Settings,
  Wrench,
  Box,
} from 'lucide-react';
import { cn } from '@/lib/cn';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/models', icon: Brain, label: 'Models' },
  { to: '/datasets', icon: Database, label: 'Datasets' },
  { to: '/experiments', icon: FlaskConical, label: 'Experiments' },
  { to: '/monitor', icon: Activity, label: 'Live Monitor' },
  { to: '/explorer', icon: Eye, label: 'Visual Explorer' },
  { to: '/compare', icon: GitCompare, label: 'Compare Runs' },
];

const bottomItems = [
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/diagnostics', icon: Wrench, label: 'Diagnostics' },
];

export function Sidebar() {
  return (
    <aside className="w-56 bg-bg-secondary border-r border-border flex flex-col">
      {/* Logo */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-border">
        <Box className="w-5 h-5 text-accent-cyan" />
        <span className="font-semibold text-sm tracking-wide">BRAINFORGE</span>
        <span className="text-[10px] text-text-muted ml-auto font-mono">v0.1</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors',
                isActive
                  ? 'bg-accent-blue/10 text-accent-blue'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
              )
            }
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="py-2 px-2 border-t border-border space-y-0.5">
        {bottomItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors',
                isActive
                  ? 'bg-accent-blue/10 text-accent-blue'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
              )
            }
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
