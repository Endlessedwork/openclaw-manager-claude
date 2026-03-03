import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Bot, Zap, Wrench, Cpu, Radio, MessageSquare,
  Clock, FileCode, Server, ChevronLeft, ChevronRight, ChevronDown, Activity,
  Webhook, MonitorDot, ScrollText, LogOut, Users, FolderOpen,
  BrainCircuit, Link2, PlayCircle, Eye, Settings, Coins, Sparkles,
  Database, UserCircle, UsersRound, BookOpen, FileText, X, GitBranch, Bell,
  SlidersHorizontal
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useIsMobile } from '../hooks/useMediaQuery';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';

const navGroups = [
  { id: 'ai-chat', type: 'featured', roles: ['superadmin'], items: [{ path: '/ai-chat', label: 'System Editor Mode', icon: Sparkles }] },
  {
    id: 'dashboard',
    type: 'standalone',
    items: [{ path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    icon: Database,
    items: [
      { path: '/workspace/users', label: 'Bot Users', icon: UserCircle },
      { path: '/workspace/groups', label: 'Groups', icon: UsersRound },
      { path: '/workspace/kb', label: 'Knowledge Base', icon: BookOpen },
      { path: '/workspace/docs', label: 'Documents', icon: FileText },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: PlayCircle,
    roles: ['superadmin', 'admin', 'manager'],
    items: [
      { path: '/sessions', label: 'Sessions', icon: MessageSquare },
      { path: '/cron', label: 'Cron Jobs', icon: Clock },
    ],
  },
  {
    id: 'usage',
    type: 'standalone',
    roles: ['superadmin', 'admin', 'manager'],
    items: [{ path: '/usage', label: 'Usage', icon: Coins }],
  },
  {
    id: 'ai-models',
    label: 'AI Models',
    icon: BrainCircuit,
    roles: ['superadmin', 'admin'],
    items: [
      { path: '/providers', label: 'Providers', icon: Server },
      { path: '/models', label: 'Models', icon: Cpu },
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: Bot,
    items: [
      { path: '/agents', label: 'Agents', icon: Bot },
      { path: '/skills', label: 'Skills', icon: Zap },
      { path: '/tools', label: 'Tools', icon: Wrench },
      // { path: '/clawhub', label: 'ClawHub', icon: Store }, // Hidden until ClawHub API integration
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Link2,
    roles: ['superadmin', 'admin'],
    items: [
      { path: '/channels', label: 'Channels', icon: Radio },
      { path: '/hooks', label: 'Hooks', icon: Webhook },
      { path: '/bindings', label: 'Bindings', icon: GitBranch },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: Eye,
    roles: ['superadmin', 'admin'],
    items: [
      { path: '/activities', label: 'Activities', icon: MonitorDot },
      { path: '/logs', label: 'Logs', icon: ScrollText },
      { path: '/health', label: 'Health', icon: Activity },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    roles: ['superadmin', 'admin'],
    items: [
      { path: '/settings/general', label: 'General', icon: SlidersHorizontal },
      { path: '/notifications', label: 'Notifications', icon: Bell },
    ],
    // Users item added dynamically for superadmins
  },
  {
    id: 'gateway',
    label: 'Gateway',
    icon: Server,
    roles: ['superadmin', 'admin'],
    items: [
      { path: '/config', label: 'Config', icon: FileCode },
      { path: '/files', label: 'Files', icon: FolderOpen },
      { path: '/gateway', label: 'Gateway', icon: Server },
    ],
  },
];

function NavItem({ path, label, icon: Icon, isActive, collapsed }) {
  const link = (
    <NavLink
      to={path}
      data-testid={`nav-${label.toLowerCase().replace(/\s/g, '-')}`}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 group ${
        isActive
          ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
          : 'text-theme-muted hover:text-theme-primary hover:bg-muted border border-transparent'
      } ${!collapsed ? 'pl-9' : ''}`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-orange-500' : 'text-theme-faint group-hover:text-theme-secondary'}`} />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="bg-surface-card text-theme-primary border-subtle">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

function NavGroup({ group, collapsed, location }) {
  const isGroupActive = group.items.some(
    ({ path }) => location.pathname === path || location.pathname.startsWith(path)
  );
  const [open, setOpen] = useState(isGroupActive);

  // Auto-open group when navigating to one of its items
  useEffect(() => {
    if (isGroupActive && !open) setOpen(true);
  }, [isGroupActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Featured item — visually distinct, gradient border
  if (group.type === 'featured') {
    const item = group.items[0];
    const isActive = location.pathname === item.path;
    const link = (
      <NavLink
        to={item.path}
        data-testid={`nav-${item.label.toLowerCase().replace(/[\s.]/g, '-')}`}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 group ${
          isActive
            ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/10 text-orange-400 border border-orange-500/40 shadow-[0_0_12px_rgba(249,115,22,0.15)]'
            : 'bg-gradient-to-r from-orange-500/10 to-amber-500/5 text-orange-400 hover:text-orange-300 hover:from-orange-500/15 hover:to-amber-500/10 border border-orange-500/20 hover:border-orange-500/30'
        }`}
      >
        <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-orange-400' : 'text-orange-500 group-hover:text-orange-400'}`} />
        {!collapsed && <span className="tracking-wide">{item.label}</span>}
      </NavLink>
    );

    const wrapped = (
      <div className="mb-2">
        {link}
      </div>
    );

    if (collapsed) {
      return (
        <div className="mb-2">
          <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right" className="bg-surface-card text-theme-primary border-subtle">
              {item.label}
            </TooltipContent>
          </Tooltip>
        </div>
      );
    }
    return wrapped;
  }

  // Standalone items (Dashboard) — no group header
  if (group.type === 'standalone') {
    const item = group.items[0];
    const isActive = location.pathname === item.path;
    const link = (
      <NavLink
        to={item.path}
        data-testid={`nav-${item.label.toLowerCase()}`}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group ${
          isActive
            ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
            : 'text-theme-muted hover:text-theme-primary hover:bg-muted border border-transparent'
        }`}
      >
        <item.icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-orange-500' : 'text-theme-faint group-hover:text-theme-secondary'}`} />
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" className="bg-surface-card text-theme-primary border-subtle">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }
    return link;
  }

  const GroupIcon = group.icon;

  // Collapsed sidebar — show only the group icon with tooltip
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setOpen(!open)}
            className={`flex items-center justify-center w-full px-3 py-2.5 rounded-md transition-all duration-200 ${
              isGroupActive
                ? 'bg-orange-500/10 text-orange-500'
                : 'text-theme-faint hover:text-theme-secondary hover:bg-muted'
            }`}
          >
            <GroupIcon className="w-4 h-4 shrink-0" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-surface-card text-theme-primary border-subtle">
          <div className="font-medium mb-1">{group.label}</div>
          <div className="text-xs text-theme-faint">
            {group.items.map(i => i.label).join(', ')}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Expanded sidebar — collapsible group
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wider w-full transition-all duration-200 ${
          isGroupActive
            ? 'text-orange-500/80'
            : 'text-theme-faint hover:text-theme-secondary'
        }`}
      >
        <GroupIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={`w-3 h-3 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="flex flex-col gap-0.5 mt-0.5">
          {group.items.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path);
            return (
              <NavItem
                key={item.path}
                {...item}
                isActive={isActive}
                collapsed={collapsed}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ isMobileMenuOpen, onClose }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const { config } = useAppConfig();
  const isMobile = useIsMobile();

  // Close drawer on route change (mobile only)
  useEffect(() => {
    if (isMobile && onClose) onClose();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build groups: filter by role, then add admin-only items
  const groups = navGroups
    .filter((group) => !group.roles || group.roles.includes(user?.role))
    .map((group) => {
      if (group.id === 'settings' && isAdmin()) {
        return { ...group, items: [...group.items, { path: '/users', label: 'Users', icon: Users }] };
      }
      return group;
    });

  const sidebarContent = (
    <aside
      data-testid="sidebar"
      className={`fixed left-0 top-0 h-screen z-50 flex flex-col transition-all duration-300 ${
        isMobile ? 'w-64' : (collapsed ? 'w-16' : 'w-64')
      } ${isMobile ? 'bg-surface-raised' : 'backdrop-blur-xl bg-surface-raised/95'} border-r border-subtle`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-subtle shrink-0">
        <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)]">
          <Activity className="w-4 h-4 text-white" />
        </div>
        {(isMobile || !collapsed) && (
          <div className="flex flex-col leading-tight flex-1">
            <span className="font-bold text-base tracking-widest" style={{ fontFamily: 'Manrope, sans-serif' }}>{config.app_name}</span>
            <span className="text-[10px] text-theme-faint tracking-wider">{config.app_subtitle}</span>
          </div>
        )}
        {isMobile && (
          <button onClick={onClose} className="p-1 text-theme-faint hover:text-theme-primary">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav Groups */}
      <ScrollArea className="flex-1 py-3">
        <nav className="flex flex-col gap-1 px-2">
          {groups.map((group) => (
            <NavGroup key={group.id} group={group} collapsed={isMobile ? false : collapsed} location={location} />
          ))}
        </nav>
      </ScrollArea>

      {/* User Profile */}
      {user && (
        <div className={`px-3 py-3 border-t border-subtle ${!isMobile && collapsed ? 'text-center' : ''}`}>
          {(isMobile || !collapsed) && (
            <div className="mb-2">
              <div className="text-sm font-medium text-theme-secondary truncate">{user.name}</div>
              <div className="text-xs text-theme-faint truncate">{user.role}</div>
            </div>
          )}
          <button
            onClick={logout}
            className={`flex items-center gap-2 text-sm text-theme-faint hover:text-red-400 transition-colors ${!isMobile && collapsed ? 'justify-center w-full' : ''}`}
          >
            <LogOut className="w-4 h-4" />
            {(isMobile || !collapsed) && <span>Sign out</span>}
          </button>
        </div>
      )}

      {/* Version label */}
      <div className={`px-3 pb-1 ${!isMobile && collapsed ? 'text-center' : ''}`}>
        <span className="text-[10px] text-theme-faint/40 tracking-wider font-mono">
          {(isMobile || !collapsed) ? `${config.app_name} ${config.app_version}` : config.app_version}
        </span>
      </div>

      {/* Collapse Toggle — desktop only */}
      {!isMobile && (
        <div className="px-2 pb-4 pt-1 border-t border-subtle">
          <Button
            data-testid="sidebar-toggle"
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full justify-center hover:bg-muted text-theme-faint hover:text-theme-secondary"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </aside>
  );

  // Desktop: render sidebar directly
  if (!isMobile) return <TooltipProvider delayDuration={0}>{sidebarContent}</TooltipProvider>;

  // Mobile: render as drawer with overlay
  if (!isMobileMenuOpen) return null;

  return (
    <TooltipProvider delayDuration={0}>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />
      {sidebarContent}
    </TooltipProvider>
  );
}
