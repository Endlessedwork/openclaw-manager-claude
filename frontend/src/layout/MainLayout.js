import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import Sidebar from './Sidebar';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/ui/button';

export default function MainLayout() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-surface-page">
      <Sidebar />
      <main className="ml-64 min-h-screen transition-all duration-300">
        <div className="flex justify-end px-8 pt-4 pb-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="text-theme-muted hover:text-theme-primary hover:bg-surface-card"
            title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
        <div className="max-w-7xl mx-auto px-8 pb-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
