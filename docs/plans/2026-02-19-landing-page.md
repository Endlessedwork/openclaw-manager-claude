# Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a public landing page at `/` showcasing all 14 system modules with a Sign In CTA, redirect authenticated users to `/dashboard`.

**Architecture:** Add `LandingPage.js` as a public route at `/`. Move `DashboardPage` from index `/` to `/dashboard`. `LandingPage` uses `useAuth` to redirect logged-in users to `/dashboard`. No backend calls needed — all content is static.

**Tech Stack:** React 19, React Router v7, Tailwind CSS, lucide-react, Manrope/Inter fonts

---

### Task 1: Update App.js routing

**Files:**
- Modify: `frontend/src/App.js`

Move Dashboard from index `/` to `/dashboard`. Add public `/` route for LandingPage. LoginPage stays at `/login`.

**Step 1: Edit App.js**

Replace the current routes block:

```jsx
import LandingPage from "./pages/LandingPage";

// Inside <Routes>:
<Route path="/" element={<LandingPage />} />
<Route path="/login" element={<LoginPage />} />
<Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
  <Route path="/dashboard" element={<DashboardPage />} />
  <Route path="/agents" element={<AgentsPage />} />
  <Route path="/skills" element={<SkillsPage />} />
  <Route path="/tools" element={<ToolsPage />} />
  <Route path="/models" element={<ModelsPage />} />
  <Route path="/channels" element={<ChannelsPage />} />
  <Route path="/sessions" element={<SessionsPage />} />
  <Route path="/cron" element={<CronPage />} />
  <Route path="/config" element={<ConfigPage />} />
  <Route path="/gateway" element={<GatewayPage />} />
  <Route path="/activities" element={<ActivitiesPage />} />
  <Route path="/logs" element={<LogsPage />} />
  <Route path="/clawhub" element={<ClawHubPage />} />
  <Route path="/hooks" element={<HooksPage />} />
  <Route path="/users" element={<ProtectedRoute roles={["admin"]}><UsersPage /></ProtectedRoute>} />
</Route>
```

**Step 2: Update ProtectedRoute redirect**

In `frontend/src/components/ProtectedRoute.js` line 17, change `/login` redirect to stay as-is (already correct). No change needed.

**Step 3: Update post-login redirect in LoginPage**

In `frontend/src/pages/LoginPage.js` line 22, change:
```js
navigate('/', { replace: true });
```
to:
```js
navigate('/dashboard', { replace: true });
```

**Step 4: Update AuthContext redirect if needed**

Check `frontend/src/contexts/AuthContext.js` for any hardcoded `/` redirects after login and change to `/dashboard`.

**Step 5: Commit**
```bash
git add frontend/src/App.js frontend/src/pages/LoginPage.js
git commit -m "feat(routing): move dashboard to /dashboard, add / for landing page"
```

---

### Task 2: Create LandingPage.js

**Files:**
- Create: `frontend/src/pages/LandingPage.js`

Full component — no backend calls, pure static + design.

**Step 1: Create the file**

```jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Activity, Bot, Zap, Wrench, Cpu, Radio, MessageSquare,
  Clock, Webhook, Store, Server, ScrollText, Settings, Users,
  ChevronRight, Shield, GitBranch, Layers
} from 'lucide-react';

const FEATURES = [
  {
    icon: Activity,
    title: 'Dashboard',
    description: 'Real-time overview of gateway health, active agents, sessions, and system metrics at a glance.',
    color: 'orange',
    href: '/dashboard',
  },
  {
    icon: Bot,
    title: 'Agents',
    description: 'Configure and manage autonomous AI agents with model bindings, tool access, and workspace settings.',
    color: 'blue',
    href: '/agents',
  },
  {
    icon: Zap,
    title: 'Skills',
    description: 'Deploy and organize agent capabilities. Browse, install, and version-control skill modules.',
    color: 'yellow',
    href: '/skills',
  },
  {
    icon: Wrench,
    title: 'Tools',
    description: 'Control granular tool permissions per agent. Group and restrict filesystem, web, and runtime access.',
    color: 'purple',
    href: '/tools',
  },
  {
    icon: Cpu,
    title: 'Models',
    description: 'Manage LLM providers and API keys. Configure multi-model fallback priority chains.',
    color: 'green',
    href: '/models',
  },
  {
    icon: Radio,
    title: 'Channels',
    description: 'Route incoming messages across communication channels — Discord, Slack, Telegram, and more.',
    color: 'blue',
    href: '/channels',
  },
  {
    icon: MessageSquare,
    title: 'Sessions',
    description: 'Monitor and inspect active agent sessions. View conversation history and context state.',
    color: 'orange',
    href: '/sessions',
  },
  {
    icon: Clock,
    title: 'Cron',
    description: 'Schedule recurring agent tasks with cron expressions. Automate workflows on any cadence.',
    color: 'yellow',
    href: '/cron',
  },
  {
    icon: Webhook,
    title: 'Hooks',
    description: 'Trigger agents via webhook events. Configure inbound HTTP hooks with payload mapping.',
    color: 'purple',
    href: '/hooks',
  },
  {
    icon: Store,
    title: 'ClawHub',
    description: 'Browse and install skills from the community marketplace. One-click deployment to your gateway.',
    color: 'green',
    href: '/clawhub',
  },
  {
    icon: Server,
    title: 'Gateway',
    description: 'Monitor gateway process health, reload config, and control the core bot runtime.',
    color: 'orange',
    href: '/gateway',
  },
  {
    icon: ScrollText,
    title: 'Logs',
    description: 'Stream real-time gateway logs with live filtering, search, and source selection.',
    color: 'blue',
    href: '/logs',
  },
  {
    icon: Settings,
    title: 'Config',
    description: 'Edit the gateway JSON configuration directly with syntax highlighting and live validation.',
    color: 'yellow',
    href: '/config',
  },
  {
    icon: Users,
    title: 'Users',
    description: 'Manage operator accounts with role-based access control — Admin, Editor, and Viewer roles.',
    color: 'purple',
    href: '/users',
  },
];

const COLOR_MAP = {
  orange: {
    icon: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    glow: 'shadow-[0_0_15px_rgba(249,115,22,0.15)]',
    hover: 'hover:border-orange-500/40',
  },
  blue: {
    icon: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    glow: 'shadow-[0_0_15px_rgba(14,165,233,0.12)]',
    hover: 'hover:border-sky-500/40',
  },
  green: {
    icon: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    glow: '',
    hover: 'hover:border-emerald-500/40',
  },
  yellow: {
    icon: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    glow: '',
    hover: 'hover:border-amber-500/40',
  },
  purple: {
    icon: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    glow: '',
    hover: 'hover:border-violet-500/40',
  },
};

const STATS = [
  { icon: Layers, label: '14 Modules', sub: 'Fully integrated' },
  { icon: Shield, label: 'Role-based Access', sub: 'Admin · Editor · Viewer' },
  { icon: Activity, label: 'Real-time Streaming', sub: 'Live logs & activities' },
  { icon: GitBranch, label: 'Multi-model Fallback', sub: 'Provider redundancy' },
];

function FeatureCard({ icon: Icon, title, description, color }) {
  const c = COLOR_MAP[color];
  return (
    <div className={`group bg-[#0c0c0e] border ${c.border} ${c.hover} rounded-xl p-5 transition-all duration-300 cursor-default`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.bg} border ${c.border} ${c.glow} mb-4`}>
        <Icon className={`w-5 h-5 ${c.icon}`} />
      </div>
      <h3 className="text-sm font-semibold text-zinc-100 mb-1.5" style={{ fontFamily: 'Manrope, sans-serif' }}>{title}</h3>
      <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>
    </div>
  );
}

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  React.useEffect(() => {
    if (!loading && user) navigate('/dashboard', { replace: true });
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Background grid */}
      <div className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }} />

      {/* Hero glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center top, rgba(249,115,22,0.08) 0%, transparent 65%)' }} />

      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/5 backdrop-blur-xl bg-[#09090b]/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)]">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-widest text-zinc-100" style={{ fontFamily: 'Manrope, sans-serif' }}>W.I.N.E</span>
              <span className="text-[10px] text-zinc-500 tracking-wider">Operation Control</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors shadow-[0_0_15px_rgba(249,115,22,0.3)]"
          >
            Sign In <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        {/* Status badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono text-emerald-400 tracking-wider">SYSTEM OPERATIONAL</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-zinc-50 mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>
          W.I.N.E{' '}
          <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #f97316, #fb923c)' }}>
            Operation Control
          </span>
        </h1>

        <p className="text-lg text-zinc-400 max-w-xl mx-auto mb-3">
          Intelligent gateway management for autonomous AI systems.
        </p>
        <p className="text-sm text-zinc-600 max-w-lg mx-auto mb-10">
          Manage agents, models, channels, sessions, and more from a single unified control center.
        </p>

        <button
          onClick={() => navigate('/login')}
          className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-lg transition-all shadow-[0_0_25px_rgba(249,115,22,0.35)] hover:shadow-[0_0_35px_rgba(249,115,22,0.5)] hover:-translate-y-0.5"
        >
          Sign In to Dashboard <ChevronRight className="w-4 h-4" />
        </button>

        {/* Stats strip */}
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mt-12">
          {STATS.map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex items-center gap-2 text-left">
              <div className="w-7 h-7 rounded-md bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center">
                <Icon className="w-3.5 h-3.5 text-orange-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-300">{label}</p>
                <p className="text-[10px] text-zinc-600">{sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="border-t border-white/5" />
      </div>

      {/* Features section */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <p className="text-xs font-mono text-orange-500 tracking-widest uppercase mb-3">Capabilities</p>
          <h2 className="text-3xl font-bold text-zinc-100" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Everything you need to manage your AI gateway
          </h2>
          <p className="text-sm text-zinc-500 mt-3 max-w-md mx-auto">
            14 integrated modules covering the full lifecycle of autonomous agent operations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>

      {/* CTA Banner */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="relative rounded-2xl border border-orange-500/15 bg-gradient-to-br from-orange-500/5 via-transparent to-transparent p-10 text-center overflow-hidden">
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, rgba(249,115,22,0.06) 0%, transparent 70%)' }} />
          <p className="text-xs font-mono text-orange-500 tracking-widest uppercase mb-3">Ready to proceed?</p>
          <h2 className="text-2xl font-bold text-zinc-100 mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Access the control center
          </h2>
          <p className="text-sm text-zinc-500 mb-6">Sign in with your operator credentials to begin.</p>
          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-lg transition-all shadow-[0_0_20px_rgba(249,115,22,0.3)]"
          >
            Sign In <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-orange-600/80 flex items-center justify-center">
              <Activity className="w-3 h-3 text-white" />
            </div>
            <span className="text-xs text-zinc-500 font-mono">W.I.N.E Operation Control</span>
          </div>
          <span className="text-xs text-zinc-700 font-mono">© 2026</span>
        </div>
      </footer>

    </div>
  );
}
```

**Step 2: Verify file saved correctly**
```bash
wc -l frontend/src/pages/LandingPage.js
```
Expected: ~220+ lines

**Step 3: Commit**
```bash
git add frontend/src/pages/LandingPage.js
git commit -m "feat(ui): add W.I.N.E landing page with features grid and hero section"
```

---

### Task 3: Build and deploy

**Files:** none (build artifacts)

**Step 1: Build**
```bash
cd frontend && yarn build 2>&1
```
Expected: `Compiled successfully.`

**Step 2: Deploy to nginx container**
```bash
docker cp frontend/build/. repo-frontend-1:/usr/share/nginx/openclaw-manager/
docker exec repo-frontend-1 nginx -s reload
```

**Step 3: Verify**
- Open `https://control.winecore.work/` — should see landing page
- Click Sign In — should go to `/login`
- After login — should redirect to `/dashboard`

**Step 4: Commit**
```bash
git add -A
git commit -m "chore: production build for landing page"
git push
```
