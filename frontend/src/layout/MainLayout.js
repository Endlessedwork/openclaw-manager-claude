import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sun, Moon, Monitor } from 'lucide-react';
import Sidebar from './Sidebar';
import RestartBanner from '../components/RestartBanner';
import { useTheme } from '../contexts/ThemeContext';

const THEME_OPTIONS = [
  { value: 'system', icon: Monitor, label: 'System' },
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
];

export default function MainLayout() {
  const { preference, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-surface-page">
      <Sidebar />
      <main className="ml-64 min-h-screen transition-all duration-300">
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
        <RestartBanner />
        <div className="max-w-7xl mx-auto px-8 pb-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
