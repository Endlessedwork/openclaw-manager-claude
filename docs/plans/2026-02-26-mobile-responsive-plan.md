# Mobile Responsive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the OpenClaw Manager dashboard fully mobile-responsive with a sidebar drawer on mobile, responsive grids, and hidden table columns.

**Architecture:** Convert the fixed sidebar to an off-canvas drawer on screens < 768px (Tailwind `md:` breakpoint). Add a mobile header bar with hamburger menu. Update all pages to use responsive grid classes and hide non-essential table columns on mobile.

**Tech Stack:** React 19, Tailwind CSS 3.4, lucide-react icons, existing shadcn/ui components. No new dependencies.

---

### Task 1: Create useMediaQuery hook

**Files:**
- Create: `frontend/src/hooks/useMediaQuery.js`

**Step 1: Create the hook**

```javascript
import { useState, useEffect } from 'react';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return !useMediaQuery('(min-width: 768px)');
}
```

**Step 2: Commit**

```bash
git add frontend/src/hooks/useMediaQuery.js
git commit -m "feat: add useMediaQuery and useIsMobile hooks"
```

---

### Task 2: Make Sidebar responsive (drawer on mobile)

**Files:**
- Modify: `frontend/src/layout/Sidebar.js`

The Sidebar component currently renders as a fixed `w-64` sidebar (line 253-257). We need to:
1. Accept `isMobileMenuOpen` and `onClose` props
2. On mobile (< md): render as a slide-in drawer with overlay
3. On desktop (>= md): keep existing behavior unchanged
4. Auto-close on route change

**Step 1: Update Sidebar to accept mobile props and add drawer behavior**

Replace the entire `export default function Sidebar()` component (lines 238-315) with:

```javascript
export default function Sidebar({ isMobileMenuOpen, onClose }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const isMobile = useIsMobile();

  // Close drawer on route change (mobile only)
  useEffect(() => {
    if (isMobile && onClose) onClose();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build groups with admin-only items
  const groups = navGroups.map((group) => {
    if (group.id === 'system' && isAdmin()) {
      return { ...group, items: [...group.items, { path: '/users', label: 'Users', icon: Users }] };
    }
    return group;
  });

  const sidebarContent = (
    <aside
      data-testid="sidebar"
      className={`fixed left-0 top-0 h-screen z-50 flex flex-col transition-all duration-300 ${
        isMobile ? 'w-64' : (collapsed ? 'w-16' : 'w-64')
      } backdrop-blur-xl bg-surface-raised/95 border-r border-subtle`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-subtle shrink-0">
        <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)]">
          <Activity className="w-4 h-4 text-white" />
        </div>
        {(isMobile || !collapsed) && (
          <div className="flex flex-col leading-tight flex-1">
            <span className="font-bold text-base tracking-widest" style={{ fontFamily: 'Manrope, sans-serif' }}>W.I.N.E</span>
            <span className="text-[10px] text-theme-faint tracking-wider">Operation Control</span>
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

      {/* Collapse Toggle — desktop only */}
      {!isMobile && (
        <div className="px-2 pb-4 pt-2 border-t border-subtle">
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
```

Add `X` to the lucide-react imports at the top of the file (line 3-9):
```javascript
import {
  LayoutDashboard, Bot, Zap, Wrench, Cpu, Radio, MessageSquare,
  Clock, FileCode, Server, ChevronLeft, ChevronRight, ChevronDown, Activity,
  Store, Webhook, MonitorDot, ScrollText, LogOut, Users, FolderOpen,
  BrainCircuit, Link2, PlayCircle, Eye, Settings, Coins,
  Database, UserCircle, UsersRound, BookOpen, FileText, X
} from 'lucide-react';
```

Add the hook import:
```javascript
import { useIsMobile } from '../hooks/useMediaQuery';
```

**Step 2: Verify desktop sidebar still works**

Run: `cd frontend && yarn test -- --testPathPattern=Sidebar`
Expected: existing tests pass (or no sidebar tests, which is fine)

**Step 3: Commit**

```bash
git add frontend/src/layout/Sidebar.js
git commit -m "feat: make sidebar responsive with drawer mode on mobile"
```

---

### Task 3: Update MainLayout with mobile header and responsive margins

**Files:**
- Modify: `frontend/src/layout/MainLayout.js`

Replace the entire file content with:

```javascript
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
        <RestartBanner />
        <div className={`max-w-7xl mx-auto pb-8 ${isMobile ? 'px-4' : 'px-8'}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

**Step 2: Run existing tests**

Run: `cd frontend && yarn test -- --testPathPattern=MainLayout`

**Step 3: Commit**

```bash
git add frontend/src/layout/MainLayout.js
git commit -m "feat: add mobile header bar and responsive layout margins"
```

---

### Task 4: Update DashboardPage responsive grid

**Files:**
- Modify: `frontend/src/pages/DashboardPage.js`

**Step 1: Find and update grid classes**

Search for `grid grid-cols` in DashboardPage.js and ensure the stats grid uses:
```
grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4
```
(2 columns on mobile instead of 1 — stats cards are small enough for 2-up)

Also search for any page header with action buttons and add responsive stacking:
```
flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3
```

**Step 2: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=DashboardPage`

**Step 3: Commit**

```bash
git add frontend/src/pages/DashboardPage.js
git commit -m "feat: make DashboardPage mobile responsive"
```

---

### Task 5: Update AgentsPage responsive grid and dialog

**Files:**
- Modify: `frontend/src/pages/AgentsPage.js`

**Step 1: Update grid and page header**

1. Agent cards grid: ensure it uses `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
2. Page header (title + "New Agent" button): add `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`
3. Dialog: add responsive width — change `max-w-2xl` to `w-full max-w-2xl mx-4 md:mx-auto`

**Step 2: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=AgentsPage`

**Step 3: Commit**

```bash
git add frontend/src/pages/AgentsPage.js
git commit -m "feat: make AgentsPage mobile responsive"
```

---

### Task 6: Update ChannelsPage responsive layout

**Files:**
- Modify: `frontend/src/pages/ChannelsPage.js`

**Step 1: Update**

1. Channel cards: ensure `grid grid-cols-1 md:grid-cols-2 gap-4` (already correct)
2. Dialog: add responsive width if needed
3. Page header: add responsive stacking

**Step 2: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=ChannelsPage`

**Step 3: Commit**

```bash
git add frontend/src/pages/ChannelsPage.js
git commit -m "feat: make ChannelsPage mobile responsive"
```

---

### Task 7: Update ModelsPage — responsive grid + table column hiding

**Files:**
- Modify: `frontend/src/pages/ModelsPage.js`

**Step 1: Update**

1. Model cards grid: ensure `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
2. **Table (list view)**: wrap table in `<div className="overflow-x-auto">` and add `hidden md:table-cell` to non-essential columns (provider ID, context window, etc.) — keep model name, provider name, status visible
3. Page header (title + view toggle): `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`

**Step 2: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=ModelsPage`

**Step 3: Commit**

```bash
git add frontend/src/pages/ModelsPage.js
git commit -m "feat: make ModelsPage mobile responsive with hidden table columns"
```

---

### Task 8: Update ProvidersPage — fix template picker + responsive grid

**Files:**
- Modify: `frontend/src/pages/ProvidersPage.js`

**Step 1: Update**

1. Provider cards: ensure `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
2. **Template picker**: change `grid-cols-3` to `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2`
3. Dialog: responsive sizing
4. Model input rows: ensure they wrap on mobile with `flex flex-wrap`

**Step 2: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=ProvidersPage`

**Step 3: Commit**

```bash
git add frontend/src/pages/ProvidersPage.js
git commit -m "feat: make ProvidersPage mobile responsive"
```

---

### Task 9: Update CronPage and HooksPage — dialog grid stacking

**Files:**
- Modify: `frontend/src/pages/CronPage.js`
- Modify: `frontend/src/pages/HooksPage.js`

**Step 1: Update CronPage**

In the create/edit cron dialog, change interior `grid grid-cols-2 gap-4` to `grid grid-cols-1 sm:grid-cols-2 gap-4`.

**Step 2: Update HooksPage**

In the create/edit hook dialog, change interior `grid grid-cols-2 gap-4` to `grid grid-cols-1 sm:grid-cols-2 gap-4`.

**Step 3: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern="CronPage|HooksPage"`

**Step 4: Commit**

```bash
git add frontend/src/pages/CronPage.js frontend/src/pages/HooksPage.js
git commit -m "feat: make CronPage and HooksPage dialogs mobile responsive"
```

---

### Task 10: Update LogsPage — responsive log line layout

**Files:**
- Modify: `frontend/src/pages/LogsPage.js`

**Step 1: Update**

1. Log lines use fixed widths (`w-[95px]`, `w-[52px]`, `w-[160px]`). On mobile, hide the timestamp and source columns with `hidden md:inline`. Keep level and message visible.
2. Filter bar: already uses `flex-wrap` which is good. Ensure gap is appropriate.
3. Terminal height: the `h-[calc(100vh-64px)]` should account for mobile header — change to `h-[calc(100vh-64px)] md:h-[calc(100vh-64px)]` or use `h-[calc(100vh-120px)]` on mobile (accounting for header + filter bar).

**Step 2: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=LogsPage`

**Step 3: Commit**

```bash
git add frontend/src/pages/LogsPage.js
git commit -m "feat: make LogsPage mobile responsive with hidden columns"
```

---

### Task 11: Update UsersPage — responsive table

**Files:**
- Modify: `frontend/src/pages/UsersPage.js`

**Step 1: Update**

1. Wrap user table in `<div className="overflow-x-auto">`
2. Hide non-essential columns on mobile with `hidden md:table-cell` (keep: name, role, actions)
3. Page header: responsive stacking

**Step 2: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=UsersPage`

**Step 3: Commit**

```bash
git add frontend/src/pages/UsersPage.js
git commit -m "feat: make UsersPage mobile responsive"
```

---

### Task 12: Update Workspace pages — responsive tables

**Files:**
- Modify: `frontend/src/pages/WorkspaceUsersPage.js`
- Modify: `frontend/src/pages/WorkspaceGroupsPage.js`
- Modify: `frontend/src/pages/WorkspaceDocsPage.js`

**Step 1: WorkspaceUsersPage**

1. Wrap table in `<div className="overflow-x-auto">`
2. Hide non-essential columns: keep username, platform, last seen. Hide with `hidden md:table-cell`: ID, role badges, created at
3. Filter row already wraps — good

**Step 2: WorkspaceGroupsPage**

1. Wrap table in `<div className="overflow-x-auto">`
2. Hide non-essential columns: keep group name, member count, actions. Hide: ID, created date, description

**Step 3: WorkspaceDocsPage**

1. Wrap each domain's table in `<div className="overflow-x-auto">`
2. Hide non-essential columns: keep document name, domain, status. Hide: ID, timestamps, size

**Step 4: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern="WorkspaceUsers|WorkspaceGroups|WorkspaceDocs"`

**Step 5: Commit**

```bash
git add frontend/src/pages/WorkspaceUsersPage.js frontend/src/pages/WorkspaceGroupsPage.js frontend/src/pages/WorkspaceDocsPage.js
git commit -m "feat: make Workspace pages mobile responsive with hidden table columns"
```

---

### Task 13: Update FilesPage — responsive split panel

**Files:**
- Modify: `frontend/src/pages/FilesPage.js`

**Step 1: Update**

The FilesPage has a split panel with a fixed `w-72` left file tree. On mobile:
1. Change the split layout from side-by-side to stacked: `flex flex-col md:flex-row`
2. Left panel: `w-full md:w-72 md:shrink-0` — full width on mobile, fixed on desktop
3. On mobile, when a directory is selected in the tree, show the contents below (no side-by-side)
4. Category grid (overview mode): already responsive

**Step 2: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=FilesPage`

**Step 3: Commit**

```bash
git add frontend/src/pages/FilesPage.js
git commit -m "feat: make FilesPage split panel mobile responsive"
```

---

### Task 14: Update remaining pages (quick fixes)

**Files:**
- Modify: `frontend/src/pages/SkillsPage.js` — page header stacking
- Modify: `frontend/src/pages/ToolsPage.js` — page header stacking
- Modify: `frontend/src/pages/SessionsPage.js` — page header stacking
- Modify: `frontend/src/pages/GatewayPage.js` — page header stacking, grid already responsive
- Modify: `frontend/src/pages/HealthPage.js` — already well-responsive, just verify
- Modify: `frontend/src/pages/ActivitiesPage.js` — page header stacking
- Modify: `frontend/src/pages/UsagePage.js` — already well-responsive, verify date picker layout
- Modify: `frontend/src/pages/WorkspaceKBPage.js` — already responsive grid
- Modify: `frontend/src/pages/ClawHubPage.js` — already responsive grid
- Modify: `frontend/src/pages/ConfigPage.js` — already responsive form, verify button layout

**Step 1: Update all pages**

For each page that has a header with title and action buttons in a row, ensure it uses:
```
flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3
```

Pages that are already responsive (HealthPage, UsagePage, ConfigPage, WorkspaceKBPage, ClawHubPage) just need verification — no changes if already correct.

**Step 2: Run all tests**

Run: `cd frontend && yarn test`

**Step 3: Commit**

```bash
git add frontend/src/pages/
git commit -m "feat: make remaining pages mobile responsive"
```

---

### Task 15: Manual testing and viewport meta verification

**Files:**
- Verify: `frontend/public/index.html` — ensure viewport meta tag exists: `<meta name="viewport" content="width=device-width, initial-scale=1" />`

**Step 1: Check viewport meta tag**

Read `frontend/public/index.html` and verify the viewport meta tag is present. CRA includes it by default but confirm.

**Step 2: Visual testing**

Use browser dev tools or Playwright to verify at these viewports:
- 375px width (iPhone SE)
- 414px width (iPhone 14)
- 768px width (iPad — should show desktop sidebar)
- 1024px width (desktop)

Check key pages: Dashboard, Agents, Models (list view), Logs, Config, Files.

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: mobile responsive polish and fixes"
```
