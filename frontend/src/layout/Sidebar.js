import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Bot, Zap, Wrench, Cpu, Radio, MessageSquare,
  Clock, FileCode, Server, ChevronLeft, ChevronRight, Activity, Menu,
  Store, Webhook, MonitorDot, ScrollText, LogOut, Users, FolderOpen
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/activities', label: 'Activities', icon: MonitorDot },
  { path: '/logs', label: 'Logs', icon: ScrollText },
  { path: '/agents', label: 'Agents', icon: Bot },
  { path: '/skills', label: 'Skills', icon: Zap },
  { path: '/clawhub', label: 'ClawHub', icon: Store },
  { path: '/tools', label: 'Tools', icon: Wrench },
  { path: '/models', label: 'Models', icon: Cpu },
  { path: '/channels', label: 'Channels', icon: Radio },
  { path: '/hooks', label: 'Hooks', icon: Webhook },
  { path: '/sessions', label: 'Sessions', icon: MessageSquare },
  { path: '/cron', label: 'Cron Jobs', icon: Clock },
  { path: '/config', label: 'Config', icon: FileCode },
  { path: '/files', label: 'Files', icon: FolderOpen },
  { path: '/gateway', label: 'Gateway', icon: Server },
  { path: '/health', label: 'Health', icon: Activity },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();

  const allNavItems = [
    ...navItems,
    ...(isAdmin() ? [{ path: '/users', label: 'Users', icon: Users }] : []),
  ];

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        data-testid="sidebar"
        className={`fixed left-0 top-0 h-screen z-50 flex flex-col transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-64'
        } backdrop-blur-xl bg-[#0b0b0d]/95 border-r border-white/5`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-white/5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)]">
            <Activity className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-base tracking-widest" style={{ fontFamily: 'Manrope, sans-serif' }}>W.I.N.E</span>
              <span className="text-[10px] text-zinc-500 tracking-wider">Operation Control</span>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <ScrollArea className="flex-1 py-3">
          <nav className="flex flex-col gap-0.5 px-2">
            {allNavItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(path));
              const link = (
                <NavLink
                  key={path}
                  to={path}
                  data-testid={`nav-${label.toLowerCase().replace(/\s/g, '-')}`}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group ${
                    isActive
                      ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-orange-500' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              );

              if (collapsed) {
                return (
                  <Tooltip key={path}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" className="bg-zinc-900 text-zinc-200 border-zinc-800">
                      {label}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            })}
          </nav>
        </ScrollArea>

        {/* User Profile */}
        {user && (
          <div className={`px-3 py-3 border-t border-white/5 ${collapsed ? 'text-center' : ''}`}>
            {!collapsed && (
              <div className="mb-2">
                <div className="text-sm font-medium text-zinc-300 truncate">{user.name}</div>
                <div className="text-xs text-zinc-500 truncate">{user.role}</div>
              </div>
            )}
            <button
              onClick={logout}
              className={`flex items-center gap-2 text-sm text-zinc-500 hover:text-red-400 transition-colors ${collapsed ? 'justify-center w-full' : ''}`}
            >
              <LogOut className="w-4 h-4" />
              {!collapsed && <span>Sign out</span>}
            </button>
          </div>
        )}

        {/* Collapse Toggle */}
        <div className="px-2 pb-4 pt-2 border-t border-white/5">
          <Button
            data-testid="sidebar-toggle"
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full justify-center hover:bg-white/5 text-zinc-500 hover:text-zinc-300"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
