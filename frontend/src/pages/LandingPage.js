import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Activity, Bot, Zap, Wrench, Cpu, Radio, MessageSquare,
  Clock, Webhook, Store, Server, ScrollText, Settings, Users,
  ArrowRight, Shield, GitBranch, Layers, Terminal, Eye,
  Lock, Gauge, BarChart3
} from 'lucide-react';

/* ─── Feature data ─── */
const FEATURES = [
  {
    icon: Activity, title: 'Dashboard', tag: 'OVERVIEW',
    description: 'Real-time system overview with gateway health indicators, active agent counts, session graphs, and live metric streams.',
    color: 'orange', span: true,
  },
  {
    icon: Bot, title: 'Agents', tag: 'CORE',
    description: 'Configure autonomous AI agents with model bindings, tool permissions, sandbox modes, and workspace isolation.',
    color: 'blue', span: true,
  },
  {
    icon: Cpu, title: 'Models', tag: 'AI ENGINE',
    description: 'Multi-provider LLM management with API key rotation and drag-and-drop fallback priority chains.',
    color: 'green', span: true,
  },
  {
    icon: Zap, title: 'Skills', tag: 'MODULES',
    description: 'Deploy and version-control agent capabilities. Install from ClawHub or build custom skill packages.',
    color: 'yellow',
  },
  {
    icon: Wrench, title: 'Tools', tag: 'PERMISSIONS',
    description: 'Granular tool access control — filesystem, web, runtime, messaging — grouped per agent.',
    color: 'purple',
  },
  {
    icon: Radio, title: 'Channels', tag: 'ROUTING',
    description: 'Route messages across Discord, Slack, Telegram, LINE, and custom integrations.',
    color: 'blue',
  },
  {
    icon: MessageSquare, title: 'Sessions', tag: 'MONITOR',
    description: 'Inspect active conversations with full context state and message history.',
    color: 'orange',
  },
  {
    icon: Clock, title: 'Cron', tag: 'SCHEDULER',
    description: 'Automate recurring agent tasks with cron expressions on any cadence.',
    color: 'yellow',
  },
  {
    icon: Webhook, title: 'Hooks', tag: 'EVENTS',
    description: 'Inbound HTTP webhooks with payload mapping and conditional agent triggers.',
    color: 'purple',
  },
  {
    icon: Store, title: 'ClawHub', tag: 'MARKETPLACE',
    description: 'Community skill marketplace with one-click install and automatic dependency resolution.',
    color: 'green',
  },
  {
    icon: Server, title: 'Gateway', tag: 'RUNTIME',
    description: 'Monitor process health, hot-reload configuration, and control the core bot runtime.',
    color: 'orange', span: true,
  },
  {
    icon: ScrollText, title: 'Logs', tag: 'STREAM',
    description: 'Real-time log streaming with live filtering, regex search, and multi-source selection.',
    color: 'blue',
  },
  {
    icon: Settings, title: 'Config', tag: 'EDITOR',
    description: 'Direct JSON config editing with syntax highlighting and live validation.',
    color: 'yellow',
  },
  {
    icon: Users, title: 'Users', tag: 'ACCESS',
    description: 'Role-based operator management — Admin, Editor, and Viewer with scoped permissions.',
    color: 'purple',
  },
];

const COLOR = {
  orange: {
    icon: 'text-orange-400', bg: 'bg-orange-500/8', border: 'border-orange-500/20',
    glow: '0 0 20px rgba(249,115,22,0.12)', tag: 'text-orange-500/70', hoverBorder: 'hover:border-orange-500/50',
  },
  blue: {
    icon: 'text-sky-400', bg: 'bg-sky-500/8', border: 'border-sky-500/20',
    glow: '0 0 20px rgba(14,165,233,0.10)', tag: 'text-sky-400/70', hoverBorder: 'hover:border-sky-400/50',
  },
  green: {
    icon: 'text-emerald-400', bg: 'bg-emerald-500/8', border: 'border-emerald-500/20',
    glow: '0 0 20px rgba(16,185,129,0.10)', tag: 'text-emerald-400/70', hoverBorder: 'hover:border-emerald-400/50',
  },
  yellow: {
    icon: 'text-amber-400', bg: 'bg-amber-500/8', border: 'border-amber-500/20',
    glow: '0 0 20px rgba(245,158,11,0.10)', tag: 'text-amber-400/70', hoverBorder: 'hover:border-amber-400/50',
  },
  purple: {
    icon: 'text-violet-400', bg: 'bg-violet-500/8', border: 'border-violet-500/20',
    glow: '0 0 20px rgba(139,92,246,0.10)', tag: 'text-violet-400/70', hoverBorder: 'hover:border-violet-400/50',
  },
};

const CAPABILITIES = [
  { icon: Layers, label: '14 Integrated Modules' },
  { icon: Shield, label: 'Role-based Access Control' },
  { icon: Activity, label: 'Real-time Log Streaming' },
  { icon: GitBranch, label: 'Multi-model Fallback' },
  { icon: Lock, label: 'JWT Authentication' },
  { icon: Terminal, label: 'CLI Gateway Bridge' },
  { icon: Eye, label: 'Live Session Monitoring' },
  { icon: Gauge, label: 'System Health Metrics' },
  { icon: BarChart3, label: 'Activity Analytics' },
  { icon: Store, label: 'Skill Marketplace' },
];

/* ─── Scroll reveal hook ─── */
function useScrollReveal() {
  const ref = useRef(null);
  const observerRef = useRef(null);

  const setRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    if (node) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
              observerRef.current?.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
      );

      node.querySelectorAll('.landing-reveal').forEach((el) => {
        observerRef.current.observe(el);
      });
    }
    ref.current = node;
  }, []);

  return setRef;
}

/* ─── Feature card ─── */
function ModuleCard({ icon: Icon, title, tag, description, color, span, delay = 0 }) {
  const c = COLOR[color];
  return (
    <div
      className={`landing-reveal group relative bg-[#0a0a0c] border ${c.border} ${c.hoverBorder} rounded-xl overflow-hidden transition-all duration-500 ${span ? 'sm:col-span-2 lg:col-span-2' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.01]">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-zinc-700 group-hover:bg-red-500/60 transition-colors duration-300" />
            <span className="w-2 h-2 rounded-full bg-zinc-700 group-hover:bg-yellow-500/60 transition-colors duration-300" />
            <span className="w-2 h-2 rounded-full bg-zinc-700 group-hover:bg-green-500/60 transition-colors duration-300" />
          </div>
          <span className={`text-[10px] font-mono tracking-widest uppercase ${c.tag}`}>{tag}</span>
        </div>
        <div className={`w-1.5 h-1.5 rounded-full ${c.bg} ${c.icon}`} style={{ boxShadow: c.glow, animation: 'landing-glow-pulse 3s ease-in-out infinite' }} />
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex items-start gap-3.5 mb-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.bg} border ${c.border} shrink-0`} style={{ boxShadow: c.glow }}>
            <Icon className={`w-4 h-4 ${c.icon}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 leading-none" style={{ fontFamily: 'Manrope, sans-serif' }}>{title}</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mt-1.5">{description}</p>
          </div>
        </div>
      </div>

      {/* Hover glow */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl"
        style={{ boxShadow: `inset 0 0 30px rgba(249,115,22,0.03)` }} />
    </div>
  );
}

/* ─── Main ─── */
export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const containerRef = useScrollReveal();

  useEffect(() => {
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
    <div ref={containerRef} className="min-h-screen bg-[#07070a] text-zinc-100 overflow-x-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ── Background layers ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Dot grid */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        {/* Top-left orange glow */}
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px]" style={{
          background: 'radial-gradient(circle, rgba(249,115,22,0.07) 0%, transparent 60%)',
        }} />
        {/* Bottom-right blue glow */}
        <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px]" style={{
          background: 'radial-gradient(circle, rgba(14,165,233,0.05) 0%, transparent 60%)',
        }} />
        {/* Scan line */}
        <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent" style={{
          animation: 'landing-scan 8s linear infinite',
        }} />
      </div>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.04] backdrop-blur-2xl bg-[#07070a]/70">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center" style={{ boxShadow: '0 0 20px rgba(249,115,22,0.35)' }}>
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-[0.2em] text-zinc-100" style={{ fontFamily: 'Manrope, sans-serif' }}>W.I.N.E</span>
              <span className="text-[9px] text-zinc-500 tracking-widest uppercase">Operation Control</span>
            </div>
          </div>
          <button
            data-testid="nav-sign-in"
            onClick={() => navigate('/login')}
            className="group flex items-center gap-2 px-4 py-2 bg-white/[0.04] hover:bg-orange-600 border border-white/[0.08] hover:border-orange-500 text-zinc-300 hover:text-white text-xs font-medium rounded-lg transition-all duration-300"
          >
            Sign In
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-28 md:pt-36 pb-24">
        <div className="max-w-3xl mx-auto text-center">
          {/* System status */}
          <div className="landing-reveal inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/[0.04] mb-10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-mono text-emerald-400/80 tracking-wider">ALL SYSTEMS OPERATIONAL</span>
          </div>

          {/* Main heading */}
          <h1 className="landing-reveal text-5xl md:text-7xl font-bold tracking-tight text-zinc-50 mb-6 leading-[1.05]" style={{ fontFamily: 'Manrope, sans-serif', animationDelay: '100ms' }}>
            <span className="block">W.I.N.E</span>
            <span className="block mt-1 text-transparent bg-clip-text" style={{
              backgroundImage: 'linear-gradient(135deg, #f97316 0%, #fb923c 40%, #fbbf24 100%)',
            }}>
              Operation Control
            </span>
          </h1>

          {/* Subtitle */}
          <p className="landing-reveal text-base md:text-lg text-zinc-400 max-w-lg mx-auto mb-4 leading-relaxed" style={{ animationDelay: '200ms' }}>
            Intelligent gateway management platform for
            autonomous AI systems.
          </p>

          {/* Terminal-style tagline */}
          <div className="landing-reveal inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] mb-10" style={{ animationDelay: '300ms' }}>
            <span className="text-[11px] font-mono text-zinc-500">$</span>
            <span className="text-[11px] font-mono text-zinc-300">manage agents · models · channels · sessions</span>
            <span className="w-px h-3.5 bg-orange-500" style={{ animation: 'landing-type-cursor 1s step-end infinite' }} />
          </div>

          {/* CTA */}
          <div className="landing-reveal flex flex-col sm:flex-row items-center justify-center gap-3" style={{ animationDelay: '400ms' }}>
            <button
              data-testid="hero-sign-in"
              onClick={() => navigate('/login')}
              className="group relative inline-flex items-center gap-2.5 px-7 py-3.5 bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm rounded-xl transition-all duration-300 hover:-translate-y-0.5"
              style={{ boxShadow: '0 0 30px rgba(249,115,22,0.3), 0 4px 20px rgba(0,0,0,0.4)' }}
            >
              Enter Control Center
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <span className="text-[11px] text-zinc-500 font-mono">v2.0 · 14 modules</span>
          </div>
        </div>

        {/* Stats bar */}
        <div className="landing-reveal mt-20 grid grid-cols-2 md:grid-cols-4 gap-3" style={{ animationDelay: '500ms' }}>
          {[
            { value: '14', label: 'Modules', icon: Layers },
            { value: '3', label: 'Access Roles', icon: Shield },
            { value: 'Live', label: 'Log Streaming', icon: Activity },
            { value: 'N+1', label: 'Model Fallback', icon: GitBranch },
          ].map(({ value, label, icon: Icon }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div className="w-8 h-8 rounded-lg bg-orange-500/[0.06] border border-orange-500/10 flex items-center justify-center">
                <Icon className="w-3.5 h-3.5 text-orange-500/80" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-200 font-mono leading-none">{value}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Capabilities marquee ── */}
      <div className="relative z-10 border-y border-white/[0.04] bg-white/[0.01] overflow-hidden py-4">
        <div className="flex whitespace-nowrap" style={{ animation: 'landing-marquee 30s linear infinite' }}>
          {[...CAPABILITIES, ...CAPABILITIES].map(({ icon: Icon, label }, i) => (
            <div key={i} className="inline-flex items-center gap-2 mx-6">
              <Icon className="w-3 h-3 text-zinc-500" />
              <span className="text-[11px] font-mono text-zinc-400 tracking-wider uppercase">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="landing-reveal text-[10px] font-mono text-orange-500 tracking-[0.3em] uppercase mb-4">System Modules</p>
          <h2 className="landing-reveal text-3xl md:text-4xl font-bold text-zinc-100 tracking-tight" style={{ fontFamily: 'Manrope, sans-serif', animationDelay: '100ms' }}>
            Full-spectrum gateway control
          </h2>
          <p className="landing-reveal text-sm text-zinc-400 mt-3 max-w-md mx-auto" style={{ animationDelay: '200ms' }}>
            14 integrated modules covering the complete lifecycle of autonomous agent operations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {FEATURES.map((f, i) => (
            <ModuleCard key={f.title} {...f} delay={i * 60} />
          ))}
        </div>
      </section>

      {/* ── Architecture section ── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="landing-reveal rounded-2xl border border-white/[0.04] bg-[#0a0a0c] overflow-hidden">
          {/* Terminal header */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.04] bg-white/[0.01]">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
            </div>
            <span className="text-[10px] font-mono text-zinc-500 ml-2 tracking-wider">SYSTEM ARCHITECTURE</span>
          </div>

          <div className="p-6 md:p-10">
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  title: 'Gateway Layer',
                  desc: 'Core runtime engine bridging the CLI tool with the management interface. Handles process lifecycle, config hot-reload, and health monitoring.',
                  items: ['Gateway Control', 'Config Editor', 'Health Metrics'],
                  color: 'orange',
                },
                {
                  title: 'Agent Layer',
                  desc: 'Agent orchestration with model bindings, skill deployment, tool permissions, and session management across multiple channels.',
                  items: ['Agents', 'Skills', 'Tools', 'Models'],
                  color: 'blue',
                },
                {
                  title: 'Operations Layer',
                  desc: 'Monitoring and automation through real-time logs, activity streams, scheduled tasks, webhooks, and role-based access control.',
                  items: ['Logs', 'Activities', 'Cron', 'Hooks'],
                  color: 'green',
                },
              ].map(({ title, desc, items, color }) => {
                const c = COLOR[color];
                return (
                  <div key={title} className="landing-reveal">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className={`w-2 h-2 rounded-full ${c.bg} ${c.icon}`} style={{ boxShadow: c.glow }} />
                      <h3 className="text-sm font-semibold text-zinc-200" style={{ fontFamily: 'Manrope, sans-serif' }}>{title}</h3>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed mb-4">{desc}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((item) => (
                        <span key={item} className={`text-[10px] font-mono px-2 py-1 rounded-md ${c.bg} border ${c.border} ${c.tag}`}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="landing-reveal relative rounded-2xl overflow-hidden" style={{ animation: 'landing-border-glow 4s ease-in-out infinite' }}>
          {/* Background glow */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at center, rgba(249,115,22,0.06) 0%, transparent 65%)',
          }} />
          <div className="absolute inset-0 border border-orange-500/15 rounded-2xl" />

          <div className="relative px-8 py-14 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-orange-500/15 bg-orange-500/[0.04] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" style={{ animation: 'landing-glow-pulse 2s ease-in-out infinite' }} />
              <span className="text-[10px] font-mono text-orange-400 tracking-widest uppercase">Ready to proceed</span>
            </div>

            <h2 className="text-2xl md:text-3xl font-bold text-zinc-100 mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Access the control center
            </h2>
            <p className="text-sm text-zinc-400 mb-8 max-w-md mx-auto">
              Sign in with your operator credentials to begin managing your AI gateway.
            </p>

            {/* Quick highlights */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto mb-10">
              {[
                { icon: Bot, label: 'Agent Management', desc: '5 agents configured' },
                { icon: Cpu, label: 'Multi-model AI', desc: 'Fallback priority chains' },
                { icon: ScrollText, label: 'Live Monitoring', desc: 'Real-time log streams' },
                { icon: Shield, label: 'Secure Access', desc: 'JWT + role-based auth' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="text-left px-3.5 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <Icon className="w-4 h-4 text-orange-500/70 mb-2" />
                  <p className="text-[11px] font-medium text-zinc-300">{label}</p>
                  <p className="text-[10px] text-zinc-500">{desc}</p>
                </div>
              ))}
            </div>

            <button
              data-testid="cta-sign-in"
              onClick={() => navigate('/login')}
              className="group inline-flex items-center gap-2.5 px-7 py-3.5 bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm rounded-xl transition-all duration-300 hover:-translate-y-0.5"
              style={{ boxShadow: '0 0 30px rgba(249,115,22,0.3), 0 4px 20px rgba(0,0,0,0.4)' }}
            >
              Sign In to Dashboard
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-[#060608]">
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-8">
          {/* Footer grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-lg bg-orange-600 flex items-center justify-center" style={{ boxShadow: '0 0 12px rgba(249,115,22,0.3)' }}>
                  <Activity className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-xs font-bold tracking-[0.2em] text-zinc-200" style={{ fontFamily: 'Manrope, sans-serif' }}>W.I.N.E</span>
                  <span className="text-[8px] text-zinc-500 tracking-widest uppercase">Operation Control</span>
                </div>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Intelligent gateway management for autonomous AI agent systems.
              </p>
            </div>

            {/* Modules */}
            <div>
              <h4 className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase mb-4">Core Modules</h4>
              <ul className="space-y-2">
                {['Dashboard', 'Agents', 'Skills', 'Tools', 'Models', 'Channels'].map((item) => (
                  <li key={item} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-default">{item}</li>
                ))}
              </ul>
            </div>

            {/* Operations */}
            <div>
              <h4 className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase mb-4">Operations</h4>
              <ul className="space-y-2">
                {['Sessions', 'Cron Jobs', 'Hooks', 'Gateway', 'Logs', 'Activities'].map((item) => (
                  <li key={item} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-default">{item}</li>
                ))}
              </ul>
            </div>

            {/* Platform */}
            <div>
              <h4 className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase mb-4">Platform</h4>
              <ul className="space-y-2">
                {['Config Editor', 'User Management', 'ClawHub Marketplace', 'Role-based Access', 'Real-time Streaming', 'Model Fallback'].map((item) => (
                  <li key={item} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-default">{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Tech stack badges */}
          <div className="flex flex-wrap items-center gap-2 mb-8 pb-8 border-b border-white/[0.04]">
            <span className="text-[10px] font-mono text-zinc-600 mr-2">Built with</span>
            {['React', 'FastAPI', 'MongoDB', 'Tailwind CSS', 'WebSocket'].map((tech) => (
              <span key={tech} className="text-[10px] font-mono text-zinc-500 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
                {tech}
              </span>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[10px] text-zinc-600 font-mono">&copy; 2026 W.I.N.E Operation Control</span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 6px rgba(16,185,129,0.5)' }} />
              <span className="text-[10px] font-mono text-zinc-500">All systems operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
