import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sun, Moon, Monitor, Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import RestartBanner from '../components/RestartBanner';
import { useTheme } from '../contexts/ThemeContext';
import { useIsMobile } from '../hooks/useMediaQuery';

const THEME_OPTIONS = [
  { value: 'system', icon: Monitor, label: 'System' },
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
];

// Map paths to page titles for mobile header
const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/usage': 'Usage',
  '/providers': 'Providers',
  '/models': 'Models',
  '/agents': 'Agents',
  '/skills': 'Skills',
  '/tools': 'Tools',
  '/clawhub': 'ClawHub',
  '/channels': 'Channels',
  '/hooks': 'Hooks',
  '/sessions': 'Sessions',
  '/cron': 'Cron Jobs',
  '/activities': 'Activities',
  '/logs': 'Logs',
  '/health': 'Health',
  '/workspace/users': 'Bot Users',
  '/workspace/groups': 'Groups',
  '/workspace/kb': 'Knowledge Base',
  '/workspace/docs': 'Documents',
  '/config': 'Config',
  '/files': 'Files',
  '/gateway': 'Gateway',
  '/users': 'Users',
  '/settings/general': 'General Settings',
  '/ai-chat': 'System Editor Mode',
};

function getPageTitle(pathname) {
  return PAGE_TITLES[pathname] || Object.entries(PAGE_TITLES).find(
    ([path]) => pathname.startsWith(path)
  )?.[1] || 'OpenClaw';
}

export default function MainLayout() {
  const { preference, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-surface-page">
      <Sidebar
        isMobileMenuOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Mobile Header Bar */}
      {isMobile && (
        <header className="fixed top-0 left-0 right-0 z-30 h-14 bg-surface-raised/95 backdrop-blur-xl border-b border-subtle flex items-center px-4 gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 -ml-1 text-theme-secondary hover:text-theme-primary"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="flex-1 text-sm font-semibold text-theme-primary truncate">
            {getPageTitle(location.pathname)}
          </span>
          <div className="flex items-center bg-surface-card/50 border border-subtle rounded-lg p-0.5 gap-0.5">
            {THEME_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = preference === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`p-1.5 rounded-md transition-colors ${active ? 'bg-orange-500/15 text-orange-500' : 'text-theme-faint hover:text-theme-secondary'}`}
                  title={opt.label}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>
        </header>
      )}

      <main className={`min-h-screen transition-all duration-300 ${isMobile ? 'ml-0 pt-14' : 'ml-64'}`}>
        {/* Desktop theme toggle */}
        {!isMobile && (
          <div className="flex justify-end px-8 pt-4 pb-0">
            <div className="flex items-center bg-surface-card/50 border border-subtle rounded-lg p-0.5 gap-0.5">
              {THEME_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const active = preference === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`p-1.5 rounded-md transition-colors ${active ? 'bg-orange-500/15 text-orange-500' : 'text-theme-faint hover:text-theme-secondary'}`}
                    title={opt.label}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className={`max-w-7xl mx-auto pb-8 ${isMobile ? 'px-4' : 'px-8'}`}>
          <RestartBanner />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
