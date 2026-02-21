import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { getActivitiesStats, getAgents, getAgent, getWsUrl } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  Activity, Wrench, MessageSquare, Cpu, Zap,
  ChevronDown, ChevronRight,
  CheckCircle, XCircle, Loader, Ban, Terminal,
  Filter, BarChart3, Users, List, Bot,
  ArrowRight, Clock, AlertTriangle, X,
  Sparkles, FolderOpen, Shield, Eye
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

const EVENT_TYPES = [
  { value: 'all', label: 'All Events' },
  { value: 'tool_call', label: 'Tool Calls' },
  { value: 'llm_request', label: 'LLM Requests' },
  { value: 'message_received', label: 'Messages In' },
  { value: 'message_sent', label: 'Messages Out' },
  { value: 'session_start', label: 'Session Start' },
  { value: 'session_end', label: 'Session End' },
  { value: 'heartbeat', label: 'Heartbeat' },
];

const STATUS_TYPES = [
  { value: 'all', label: 'All Status' },
  { value: 'completed', label: 'Completed' },
  { value: 'running', label: 'Running' },
  { value: 'error', label: 'Error' },
  { value: 'cancelled', label: 'Cancelled' },
];

function eventIcon(type) {
  const icons = {
    tool_call: Wrench,
    llm_request: Cpu,
    message_received: MessageSquare,
    message_sent: MessageSquare,
    session_start: Zap,
    session_end: Ban,
    heartbeat: Activity,
  };
  return icons[type] || Activity;
}

function eventColor(type) {
  const colors = {
    tool_call: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
    llm_request: 'text-violet-500 bg-violet-500/10 border-violet-500/20',
    message_received: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    message_sent: 'text-teal-500 bg-teal-500/10 border-teal-500/20',
    session_start: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    session_end: 'text-zinc-500 bg-muted border-strong',
    heartbeat: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  };
  return colors[type] || 'text-zinc-500 bg-muted border-strong';
}

function eventLabel(type) {
  const labels = {
    tool_call: 'Tool Call',
    llm_request: 'LLM Request',
    message_received: 'Message In',
    message_sent: 'Message Out',
    session_start: 'Session Start',
    session_end: 'Session End',
    heartbeat: 'Heartbeat',
  };
  return labels[type] || type;
}

function statusIndicator(status) {
  if (status === 'completed') return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === 'running') return <Loader className="w-3.5 h-3.5 text-sky-500 animate-spin" />;
  if (status === 'error') return <XCircle className="w-3.5 h-3.5 text-red-500" />;
  if (status === 'cancelled') return <Ban className="w-3.5 h-3.5 text-zinc-500" />;
  return <Activity className="w-3.5 h-3.5 text-zinc-500" />;
}

function statusBadge(status) {
  const cls = {
    completed: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    running: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
    error: 'text-red-500 bg-red-500/10 border-red-500/20',
    cancelled: 'text-zinc-500 bg-muted border-strong',
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${cls[status] || cls.cancelled}`}>
      {status}
    </span>
  );
}

// Internal subsystems that should be hidden from the UI
const HIDDEN_AGENTS = ['embedded'];

const AGENT_COLORS = [
  { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', dot: 'bg-orange-500', glow: 'rgba(249,115,22,0.4)' },
  { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', dot: 'bg-sky-500', glow: 'rgba(14,165,233,0.4)' },
  { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-500', glow: 'rgba(16,185,129,0.4)' },
  { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', dot: 'bg-violet-500', glow: 'rgba(139,92,246,0.4)' },
  { text: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20', dot: 'bg-pink-500', glow: 'rgba(236,72,153,0.4)' },
  { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: 'bg-amber-500', glow: 'rgba(245,158,11,0.4)' },
  { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', dot: 'bg-cyan-500', glow: 'rgba(6,182,212,0.4)' },
  { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', dot: 'bg-rose-500', glow: 'rgba(244,63,94,0.4)' },
];

function getAgentColorSet(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

function agentColor(name) {
  return getAgentColorSet(name).text;
}

function formatDuration(ms) {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function summarizeMessage(msg) {
  if (!msg) return '';
  // Try to extract meaningful info from raw log messages
  // If it's JSON, try to pull out a summary field
  if (msg.startsWith('{') || msg.startsWith('[')) {
    try {
      const obj = JSON.parse(msg);
      // Cron jobs
      if (obj.jobs) {
        const names = obj.jobs.map(j => j.name).filter(Boolean);
        if (names.length) return `Cron: ${names.join(', ')}`;
        return `${obj.jobs.length} cron job(s)`;
      }
      // Subsystem logs
      if (obj.subsystem) {
        const parts = [obj.subsystem];
        if (obj.rawName) parts.push(obj.rawName);
        return parts.join(' — ');
      }
      // Generic: try common summary fields
      for (const key of ['name', 'title', 'message', 'msg', 'description', 'action', 'event']) {
        if (typeof obj[key] === 'string') return obj[key].slice(0, 120);
      }
    } catch {}
    // Not parseable or no good fields - just truncate
    return msg.slice(0, 80) + (msg.length > 80 ? '...' : '');
  }
  // Check for subsystem prefix pattern: {subsystem} {details} message
  const subMatch = msg.match(/^\{"subsystem":"([^"]+)"\}\s*(?:\{[^}]*\}\s*)?(.+)/);
  if (subMatch) {
    return `[${subMatch[1]}] ${subMatch[2].slice(0, 100)}`;
  }
  return msg.slice(0, 120) + (msg.length > 120 ? '...' : '');
}

function describeActivity(act) {
  if (act.event_type === 'tool_call' && act.tool_name) {
    return `${act.tool_name}${act.tool_input ? ` — ${act.tool_input}` : ''}`;
  }
  if (act.event_type === 'llm_request' && act.model_used) {
    return `Thinking with ${act.model_used}`;
  }
  if (act.event_type === 'session_start') return 'Session started';
  if (act.event_type === 'session_end') return 'Session ended';
  if (act.event_type === 'heartbeat') return 'Heartbeat';
  // For messages - try to summarize
  if (act.message) return summarizeMessage(act.message);
  if (act.event_type === 'message_received') return 'Received a message';
  if (act.event_type === 'message_sent') return 'Sent a message';
  return eventLabel(act.event_type);
}

// ─── Activity Row (used in Stream view) ─────────────────────────────────────

function ActivityRow({ act, isExpanded, onToggle }) {
  const Icon = eventIcon(act.event_type);

  return (
    <div
      data-testid={`activity-row-${act.id}`}
      className={`border-b border-subtle transition-colors ${
        act.status === 'error' ? 'bg-red-500/[0.03]' :
        act.status === 'running' ? 'bg-sky-500/[0.02]' :
        'hover:bg-muted/30'
      }`}
    >
      {/* Main Row */}
      <div
        className="px-4 py-2.5 flex items-center gap-3 cursor-pointer select-none"
        onClick={onToggle}
      >
        {/* Expand Arrow */}
        <button className="text-theme-dimmed hover:text-theme-muted transition-colors w-4 shrink-0">
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Status Indicator */}
        <div className="shrink-0">{statusIndicator(act.status)}</div>

        {/* Timestamp */}
        <span className="text-[10px] font-mono text-theme-dimmed w-16 shrink-0 tabular-nums">
          {timeAgo(act.timestamp)}
        </span>

        {/* Event Type Badge */}
        <div className={`shrink-0 w-6 h-6 rounded flex items-center justify-center border ${eventColor(act.event_type)}`}>
          <Icon className="w-3 h-3" />
        </div>

        {/* Agent Name */}
        <span className={`text-xs font-mono shrink-0 w-20 truncate ${agentColor(act.agent_name)}`}>
          {act.agent_name || act.agent_id}
        </span>

        {/* Event Description */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-card border border-subtle text-theme-muted shrink-0">
            {act.event_type}
          </span>
          {act.tool_name && (
            <span className="text-xs font-mono text-theme-secondary">{act.tool_name}</span>
          )}
          {act.tool_input && (
            <span className="text-xs text-theme-faint truncate">{act.tool_input}</span>
          )}
          {act.model_used && (
            <span className="text-xs font-mono text-violet-400">{act.model_used}</span>
          )}
          {act.error && (
            <span className="text-xs text-red-400 truncate">{act.error}</span>
          )}
        </div>

        {/* Duration */}
        {act.duration_ms > 0 && (
          <span className={`text-[10px] font-mono tabular-nums shrink-0 ${
            act.duration_ms > 10000 ? 'text-amber-500' : act.duration_ms > 5000 ? 'text-theme-muted' : 'text-theme-dimmed'
          }`}>
            {formatDuration(act.duration_ms)}
          </span>
        )}

        {/* Tokens */}
        {act.tokens_in > 0 && (
          <span className="text-[10px] font-mono text-theme-dimmed shrink-0 tabular-nums">
            {act.tokens_in}+{act.tokens_out}t
          </span>
        )}

        {/* Channel */}
        {act.channel && (
          <span className="text-[10px] font-mono text-theme-dimmed shrink-0">{act.channel}</span>
        )}
      </div>

      {/* Expanded Verbose Section */}
      {isExpanded && (
        <div className="px-4 pb-3 ml-8 animate-fade-in">
          <div className="bg-surface-sunken border border-subtle rounded-lg overflow-hidden">
            {/* Verbose Header */}
            <div className="px-3 py-1.5 bg-surface-terminal border-b border-subtle flex items-center gap-2">
              <Terminal className="w-3 h-3 text-zinc-600" />
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Verbose Output</span>
              {act.session_key && <span className="text-[10px] font-mono text-zinc-700 ml-auto truncate max-w-[300px]">{act.session_key}</span>}
            </div>
            {/* Verbose Content */}
            <pre className="px-3 py-2.5 text-xs font-mono text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
              {act.verbose || 'No verbose output'}
            </pre>
            {/* Detail Footer */}
            <div className="px-3 py-1.5 bg-surface-terminal border-t border-subtle flex flex-wrap items-center gap-3 text-[10px] font-mono text-zinc-600">
              {act.tool_name && <span>Tool: <span className="text-zinc-400">{act.tool_name}</span></span>}
              {act.model_used && <span>Model: <span className="text-violet-400">{act.model_used}</span></span>}
              {act.tokens_in > 0 && <span>Tokens: <span className="text-zinc-400">{act.tokens_in} in / {act.tokens_out} out</span></span>}
              {act.duration_ms > 0 && <span>Duration: <span className="text-zinc-400">{formatDuration(act.duration_ms)}</span></span>}
              {act.peer && <span>Peer: <span className="text-zinc-400">{act.peer}</span></span>}
              <span className="ml-auto">{act.timestamp ? new Date(act.timestamp).toLocaleString() : ''}</span>
            </div>
          </div>
          {/* Tool Input/Output */}
          {(act.tool_input || act.tool_output) && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {act.tool_input && (
                <div className="bg-surface-sunken border border-subtle rounded p-2">
                  <span className="text-[9px] font-mono text-theme-dimmed uppercase tracking-wider">Input</span>
                  <p className="text-xs font-mono text-theme-muted mt-1">{act.tool_input}</p>
                </div>
              )}
              {act.tool_output && (
                <div className="bg-surface-sunken border border-subtle rounded p-2">
                  <span className="text-[9px] font-mono text-theme-dimmed uppercase tracking-wider">Output</span>
                  <p className="text-xs font-mono text-theme-muted mt-1">{act.tool_output}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Agent Detail Panel ──────────────────────────────────────────────────────

function AgentDetailPanel({ agentInfo, detail, loadingDetail, activities, onClose }) {
  const colorSet = getAgentColorSet(agentInfo.name);
  const running = activities.filter(a => a.status === 'running');
  const errors = activities.filter(a => a.status === 'error');
  const completed = activities.filter(a => a.status === 'completed');

  return (
    <div data-testid={`agent-detail-${agentInfo.name}`} className="bg-surface-card border border-subtle rounded-xl overflow-hidden animate-fade-in">
      {/* Detail Header */}
      <div className={`px-5 py-4 ${colorSet.bg} border-b ${colorSet.border}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl border ${colorSet.border} bg-surface-card`}>
              {agentInfo.identity_emoji || <Bot className={`w-5 h-5 ${colorSet.text}`} />}
            </div>
            <div>
              <h2 className={`text-lg font-bold ${colorSet.text}`} style={{ fontFamily: 'Manrope, sans-serif' }}>
                {agentInfo.name}
              </h2>
              {agentInfo.description && (
                <p className="text-xs text-theme-muted mt-0.5">{agentInfo.description}</p>
              )}
            </div>
          </div>
          <button
            data-testid="close-detail"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted/50 text-theme-dimmed hover:text-theme-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Agent Info Grid */}
      <div className="px-5 py-3 border-b border-subtle grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-[10px] font-mono text-theme-dimmed uppercase tracking-wider mb-0.5">Model</p>
          <p className="text-xs font-mono text-violet-400">{agentInfo.model_primary || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono text-theme-dimmed uppercase tracking-wider mb-0.5">Status</p>
          <p className={`text-xs font-mono ${running.length > 0 ? 'text-sky-400' : 'text-emerald-400'}`}>
            {running.length > 0 ? 'Active' : 'Idle'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-mono text-theme-dimmed uppercase tracking-wider mb-0.5">Activities</p>
          <p className="text-xs font-mono text-theme-muted">{activities.length} events</p>
        </div>
        <div>
          <p className="text-[10px] font-mono text-theme-dimmed uppercase tracking-wider mb-0.5">Errors</p>
          <p className={`text-xs font-mono ${errors.length > 0 ? 'text-red-400' : 'text-theme-dimmed'}`}>{errors.length}</p>
        </div>
      </div>

      {/* Extra detail from API */}
      {loadingDetail ? (
        <div className="px-5 py-4 flex items-center gap-2 text-theme-dimmed">
          <Loader className="w-3.5 h-3.5 animate-spin" />
          <span className="text-xs">Loading details...</span>
        </div>
      ) : detail && (
        <div className="px-5 py-3 border-b border-subtle space-y-3">
          {detail.workspace && (
            <div className="flex items-start gap-2">
              <FolderOpen className="w-3.5 h-3.5 text-theme-dimmed shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-mono text-theme-dimmed uppercase tracking-wider">Workspace</p>
                <p className="text-xs font-mono text-theme-muted break-all">{detail.workspace}</p>
              </div>
            </div>
          )}
          {detail.soul_md && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-mono text-theme-dimmed uppercase tracking-wider">SOUL.md</span>
              </div>
              <pre className="text-xs font-mono text-theme-muted bg-surface-sunken border border-subtle rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {detail.soul_md}
              </pre>
            </div>
          )}
          {detail.identity_md && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Shield className="w-3 h-3 text-sky-400" />
                <span className="text-[10px] font-mono text-theme-dimmed uppercase tracking-wider">IDENTITY.md</span>
              </div>
              <pre className="text-xs font-mono text-theme-muted bg-surface-sunken border border-subtle rounded-lg p-3 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {detail.identity_md}
              </pre>
            </div>
          )}
          {!detail.workspace && !detail.soul_md && !detail.identity_md && (
            <p className="text-xs text-theme-dimmed py-1">No additional configuration files found.</p>
          )}
        </div>
      )}

      {/* Currently Running */}
      {running.length > 0 && (
        <div className="px-5 py-3 border-b border-sky-500/10 bg-sky-500/[0.02]">
          <div className="flex items-center gap-1.5 mb-2">
            <Loader className="w-3 h-3 text-sky-400 animate-spin" />
            <span className="text-[10px] font-mono text-sky-400 uppercase tracking-wider font-semibold">Currently Doing</span>
          </div>
          <div className="space-y-1.5">
            {running.map(act => {
              const Icon = eventIcon(act.event_type);
              return (
                <div key={act.id} className="flex items-center gap-2 bg-sky-500/[0.05] rounded-lg px-3 py-2 border border-sky-500/10">
                  <div className={`shrink-0 w-5 h-5 rounded flex items-center justify-center border ${eventColor(act.event_type)}`}>
                    <Icon className="w-2.5 h-2.5" />
                  </div>
                  <span className="text-xs text-theme-primary flex-1 min-w-0 truncate">{describeActivity(act)}</span>
                  {act.duration_ms > 0 && (
                    <span className="text-[10px] font-mono text-sky-400/70 tabular-nums shrink-0">{formatDuration(act.duration_ms)}</span>
                  )}
                  <span className="text-[10px] font-mono text-theme-dimmed tabular-nums shrink-0">{timeAgo(act.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Errors */}
      {errors.length > 0 && (
        <div className="px-5 py-3 border-b border-red-500/10 bg-red-500/[0.02]">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider font-semibold">Recent Errors</span>
          </div>
          <div className="space-y-1.5">
            {errors.slice(0, 5).map(act => (
              <div key={act.id} className="flex items-center gap-2 bg-red-500/[0.05] rounded-lg px-3 py-1.5 border border-red-500/10">
                <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                <span className="text-xs text-red-300 flex-1 min-w-0 truncate">{act.error || describeActivity(act)}</span>
                <span className="text-[10px] font-mono text-theme-dimmed tabular-nums shrink-0">{timeAgo(act.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Activity Timeline */}
      {completed.length > 0 && (
        <div className="px-5 py-3">
          <p className="text-[10px] font-mono text-theme-dimmed uppercase tracking-wider mb-2">
            Recent Activity ({completed.length})
          </p>
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {completed.slice(0, 20).map(act => {
              const Icon = eventIcon(act.event_type);
              return (
                <div key={act.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 transition-colors">
                  <div className={`shrink-0 w-4.5 h-4.5 rounded flex items-center justify-center opacity-60 ${eventColor(act.event_type)}`}>
                    <Icon className="w-2.5 h-2.5" />
                  </div>
                  <span className="text-[10px] font-mono text-theme-dimmed w-14 shrink-0 tabular-nums">{timeAgo(act.timestamp)}</span>
                  <span className="text-xs text-theme-muted flex-1 min-w-0 truncate">{describeActivity(act)}</span>
                  {act.duration_ms > 0 && (
                    <span className="text-[10px] font-mono text-theme-dimmed tabular-nums shrink-0">{formatDuration(act.duration_ms)}</span>
                  )}
                </div>
              );
            })}
            {completed.length > 20 && (
              <p className="text-[10px] font-mono text-theme-dimmed pl-2 pt-1">+{completed.length - 20} more</p>
            )}
          </div>
        </div>
      )}

      {/* No activity state */}
      {activities.length === 0 && !loadingDetail && (
        <div className="px-5 py-6 text-center">
          <Activity className="w-8 h-8 text-theme-dimmed mx-auto mb-2" />
          <p className="text-xs text-theme-dimmed">No recent activity for this agent</p>
        </div>
      )}
    </div>
  );
}

// ─── Agent Card (used in Agents view) ────────────────────────────────────────

function AgentCard({ agentName, agentInfo, activities, expanded, onToggleExpand, onSelectAgent, isSelected }) {
  const colorSet = getAgentColorSet(agentName);
  const running = activities.filter(a => a.status === 'running');
  const errors = activities.filter(a => a.status === 'error');
  const completed = activities.filter(a => a.status === 'completed');
  const latestCompleted = completed.slice(0, 8);
  const isActive = running.length > 0;
  const hasErrors = errors.length > 0;
  const lastSeen = activities[0]?.timestamp;

  // Determine agent overall status
  const agentStatus = isActive ? 'active' : hasErrors && errors[0] === activities[0] ? 'error' : activities.length === 0 ? 'no_activity' : 'idle';

  const statusConfig = {
    active: { label: 'Active', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/30', dot: 'bg-sky-500', glow: true },
    error: { label: 'Error', cls: 'text-red-400 bg-red-500/10 border-red-500/30', dot: 'bg-red-500', glow: false },
    idle: { label: 'Idle', cls: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20', dot: 'bg-zinc-600', glow: false },
    no_activity: { label: 'No Activity', cls: 'text-zinc-600 bg-zinc-500/5 border-zinc-500/10', dot: 'bg-zinc-700', glow: false },
  };
  const sc = statusConfig[agentStatus];

  return (
    <div
      data-testid={`agent-card-${agentName}`}
      className={`bg-surface-card border rounded-xl overflow-hidden transition-all duration-300 ${
        isSelected ? `border-orange-500/40 ring-1 ring-orange-500/20` :
        isActive ? `border-sky-500/30` : hasErrors ? 'border-red-500/20' : 'border-subtle'
      }`}
      style={isActive && !isSelected ? { boxShadow: `0 0 20px ${colorSet.glow}` } : {}}
    >
      {/* Agent Header — clickable */}
      <div
        className={`px-4 py-3 flex items-center gap-3 cursor-pointer group ${isActive ? 'bg-sky-500/[0.03]' : 'hover:bg-muted/20'}`}
        onClick={() => onSelectAgent(agentInfo || { id: agentName, name: agentName })}
      >
        {/* Agent Avatar */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorSet.bg} border ${colorSet.border} text-base`}>
          {agentInfo?.identity_emoji || <Bot className={`w-4.5 h-4.5 ${colorSet.text}`} />}
        </div>

        {/* Agent Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-semibold truncate ${colorSet.text}`} style={{ fontFamily: 'Manrope, sans-serif' }}>
              {agentName}
            </h3>
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${sc.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${isActive ? 'animate-pulse' : ''}`}
                style={sc.glow ? { boxShadow: '0 0 6px rgba(14,165,233,0.6)' } : {}} />
              {sc.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {agentInfo?.description && (
              <p className="text-[10px] text-theme-faint truncate">{agentInfo.description}</p>
            )}
            {lastSeen && (
              <p className="text-[10px] font-mono text-theme-dimmed shrink-0">
                {agentInfo?.description ? '·' : 'Last:'} {timeAgo(lastSeen)}
              </p>
            )}
          </div>
        </div>

        {/* Summary Counts */}
        <div className="flex items-center gap-3 shrink-0">
          {running.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-sky-400">
              <Loader className="w-3 h-3 animate-spin" />
              {running.length}
            </div>
          )}
          {errors.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-red-400">
              <AlertTriangle className="w-3 h-3" />
              {errors.length}
            </div>
          )}
          <div className="flex items-center gap-1 text-[10px] font-mono text-theme-dimmed">
            <CheckCircle className="w-3 h-3" />
            {completed.length}
          </div>
          {/* View detail indicator */}
          <Eye className="w-3.5 h-3.5 text-theme-dimmed opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Currently Running */}
      {running.length > 0 && (
        <div className="px-4 py-2.5 border-t border-sky-500/10 bg-sky-500/[0.02]">
          <div className="flex items-center gap-1.5 mb-2">
            <Loader className="w-3 h-3 text-sky-400 animate-spin" />
            <span className="text-[10px] font-mono text-sky-400 uppercase tracking-wider font-semibold">
              Currently Doing
            </span>
          </div>
          <div className="space-y-1.5">
            {running.map(act => {
              const Icon = eventIcon(act.event_type);
              return (
                <div key={act.id} data-testid={`activity-row-${act.id}`} className="flex items-center gap-2 bg-sky-500/[0.05] rounded-lg px-3 py-2 border border-sky-500/10">
                  <div className={`shrink-0 w-5 h-5 rounded flex items-center justify-center border ${eventColor(act.event_type)}`}>
                    <Icon className="w-2.5 h-2.5" />
                  </div>
                  <span className="text-xs text-theme-primary flex-1 min-w-0 truncate">
                    {describeActivity(act)}
                  </span>
                  {act.duration_ms > 0 && (
                    <span className="text-[10px] font-mono text-sky-400/70 tabular-nums shrink-0">
                      {formatDuration(act.duration_ms)}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-theme-dimmed tabular-nums shrink-0">
                    {timeAgo(act.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Errors */}
      {hasErrors && errors.slice(0, 2).length > 0 && (
        <div className="px-4 py-2.5 border-t border-red-500/10 bg-red-500/[0.02]">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider font-semibold">
              Errors
            </span>
          </div>
          <div className="space-y-1.5">
            {errors.slice(0, 2).map(act => (
              <div key={act.id} data-testid={`activity-row-${act.id}`} className="flex items-center gap-2 bg-red-500/[0.05] rounded-lg px-3 py-1.5 border border-red-500/10">
                <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                <span className="text-xs text-red-300 flex-1 min-w-0 truncate">
                  {act.error || describeActivity(act)}
                </span>
                <span className="text-[10px] font-mono text-theme-dimmed tabular-nums shrink-0">
                  {timeAgo(act.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed History */}
      {latestCompleted.length > 0 && (
        <div className="px-4 py-2.5 border-t border-subtle">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(agentName); }}
            className="flex items-center gap-1.5 mb-2 w-full text-left group/btn"
          >
            {expanded[agentName] ? (
              <ChevronDown className="w-3 h-3 text-theme-dimmed" />
            ) : (
              <ChevronRight className="w-3 h-3 text-theme-dimmed" />
            )}
            <span className="text-[10px] font-mono text-theme-dimmed uppercase tracking-wider group-hover/btn:text-theme-muted transition-colors">
              Recent ({completed.length})
            </span>
          </button>
          {expanded[agentName] && (
            <div className="space-y-0.5 animate-fade-in">
              {latestCompleted.map(act => {
                const Icon = eventIcon(act.event_type);
                return (
                  <div key={act.id} data-testid={`activity-row-${act.id}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 transition-colors group/row">
                    <div className={`shrink-0 w-4.5 h-4.5 rounded flex items-center justify-center opacity-60 ${eventColor(act.event_type)}`}>
                      <Icon className="w-2.5 h-2.5" />
                    </div>
                    <span className="text-[10px] font-mono text-theme-dimmed w-12 shrink-0 tabular-nums">
                      {timeAgo(act.timestamp)}
                    </span>
                    <span className="text-xs text-theme-muted flex-1 min-w-0 truncate">
                      {describeActivity(act)}
                    </span>
                    {act.duration_ms > 0 && (
                      <span className="text-[10px] font-mono text-theme-dimmed tabular-nums shrink-0">
                        {formatDuration(act.duration_ms)}
                      </span>
                    )}
                  </div>
                );
              })}
              {completed.length > 8 && (
                <p className="text-[10px] font-mono text-theme-dimmed pl-2 pt-1">
                  +{completed.length - 8} more
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state for agents with no activities */}
      {activities.length === 0 && (
        <div className="px-4 py-3 border-t border-subtle">
          <p className="text-xs text-theme-dimmed">No recent activity</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ActivitiesPage() {
  const { token } = useAuth();
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState(null);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterEvent, setFilterEvent] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showStats, setShowStats] = useState(true);
  const [viewMode, setViewMode] = useState('agents'); // 'agents' or 'stream'
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agentDetail, setAgentDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const scrollRef = useRef(null);
  const wsRef = useRef(null);

  // Initial load (agents + stats)
  useEffect(() => {
    const init = async () => {
      try {
        const [agRes, statsRes] = await Promise.all([getAgents(), getActivitiesStats()]);
        setAgents(agRes.data);
        setStats(statsRes.data);
      } catch {}
      setLoading(false);
    };
    init();
  }, []);

  // Refresh stats periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      try { const res = await getActivitiesStats(); setStats(res.data); } catch {}
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket connection
  useEffect(() => {
    if (!autoRefresh) {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      setWsConnected(false);
      return;
    }
    let ws = null;
    let reconnectTimer = null;
    let pingTimer = null;

    const connect = () => {
      ws = new WebSocket(getWsUrl('activities', token));
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        pingTimer = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') return;
          const newActs = (msg.data || []).filter(a =>
            !HIDDEN_AGENTS.includes(a.agent_name || a.agent_id)
          );
          if (newActs.length === 0) return;
          setActivities(prev => {
            const combined = msg.type === 'init' ? newActs : [...newActs, ...prev];
            return combined.slice(0, 300);
          });
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (pingTimer) clearInterval(pingTimer);
        if (autoRefresh) reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => setWsConnected(false);
    };

    connect();
    return () => { if (ws) ws.close(); if (reconnectTimer) clearTimeout(reconnectTimer); if (pingTimer) clearInterval(pingTimer); };
  }, [autoRefresh, token]);

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Handle agent detail selection
  const handleSelectAgent = useCallback(async (agentInfo) => {
    if (selectedAgent?.name === agentInfo.name) {
      setSelectedAgent(null);
      setAgentDetail(null);
      return;
    }
    setSelectedAgent(agentInfo);
    setAgentDetail(null);
    setLoadingDetail(true);
    try {
      const res = await getAgent(agentInfo.id || agentInfo.name);
      setAgentDetail(res.data);
    } catch {
      setAgentDetail(null);
    }
    setLoadingDetail(false);
  }, [selectedAgent]);

  // Client-side filter
  const filteredActivities = activities.filter(a => {
    if (filterAgent !== 'all' && a.agent_id !== filterAgent) return false;
    if (filterEvent !== 'all' && a.event_type !== filterEvent) return false;
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return true;
  });

  // Group activities by agent — include ALL agents from the system
  const agentGroups = useMemo(() => {
    const groups = {};
    // First, seed with all known agents (even those with no activities)
    for (const ag of agents) {
      const name = ag.name || ag.id;
      if (!groups[name]) groups[name] = { activities: [], agentInfo: ag };
    }
    // Then add activities (skip hidden agents)
    for (const act of filteredActivities) {
      const name = act.agent_name || act.agent_id || 'unknown';
      if (HIDDEN_AGENTS.includes(name)) continue;
      if (!groups[name]) groups[name] = { activities: [], agentInfo: null };
      groups[name].activities.push(act);
    }
    // Sort: active first, then by recent activity, then agents with no activity last
    return Object.entries(groups).sort(([, a], [, b]) => {
      const aRunning = a.activities.some(x => x.status === 'running');
      const bRunning = b.activities.some(x => x.status === 'running');
      if (aRunning && !bRunning) return -1;
      if (!aRunning && bRunning) return 1;
      const aTime = a.activities[0] ? new Date(a.activities[0].timestamp || 0).getTime() : -1;
      const bTime = b.activities[0] ? new Date(b.activities[0].timestamp || 0).getTime() : -1;
      return bTime - aTime;
    });
  }, [filteredActivities, agents]);

  return (
    <div data-testid="activities-page" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Activities
          </h1>
          <p className="text-sm text-theme-faint mt-1">Real-time agent behavior monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-surface-card border border-subtle rounded-lg overflow-hidden">
            <button
              data-testid="view-agents"
              onClick={() => setViewMode('agents')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-colors ${
                viewMode === 'agents'
                  ? 'bg-orange-500/10 text-orange-400 border-r border-orange-500/20'
                  : 'text-theme-dimmed hover:text-theme-muted border-r border-subtle'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Agents
            </button>
            <button
              data-testid="view-stream"
              onClick={() => setViewMode('stream')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-colors ${
                viewMode === 'stream'
                  ? 'bg-orange-500/10 text-orange-400'
                  : 'text-theme-dimmed hover:text-theme-muted'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Stream
            </button>
          </div>

          {/* Live Toggle */}
          <div className="flex items-center gap-2 bg-surface-card border border-subtle rounded-lg px-3 py-2">
            <div className={`w-2 h-2 rounded-full ${autoRefresh && wsConnected ? 'bg-emerald-500 animate-pulse' : autoRefresh ? 'bg-amber-500' : 'bg-zinc-600'}`}
              style={autoRefresh && wsConnected ? { boxShadow: '0 0 8px rgba(16,185,129,0.6)' } : {}} />
            <Label className="text-xs text-theme-muted cursor-pointer" htmlFor="auto-refresh">Live</Label>
            <Switch
              id="auto-refresh"
              data-testid="live-toggle"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && showStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-surface-card border border-subtle rounded-lg p-3">
            <p className="text-[10px] text-theme-dimmed uppercase tracking-wider font-mono">Total</p>
            <p className="text-xl font-bold text-theme-primary tabular-nums" style={{ fontFamily: 'Manrope' }}>{stats.total}</p>
          </div>
          <div className="bg-surface-card border border-subtle rounded-lg p-3">
            <p className="text-[10px] text-theme-dimmed uppercase tracking-wider font-mono">Running</p>
            <p className="text-xl font-bold text-sky-500 tabular-nums" style={{ fontFamily: 'Manrope' }}>{stats.running}</p>
          </div>
          <div className="bg-surface-card border border-subtle rounded-lg p-3">
            <p className="text-[10px] text-theme-dimmed uppercase tracking-wider font-mono">Errors</p>
            <p className="text-xl font-bold text-red-500 tabular-nums" style={{ fontFamily: 'Manrope' }}>{stats.errors}</p>
          </div>
          {/* Top tools */}
          {stats.by_tool?.slice(0, 3).map(t => (
            <div key={t._id} className="bg-surface-card border border-subtle rounded-lg p-3">
              <p className="text-[10px] text-theme-dimmed uppercase tracking-wider font-mono">{t._id}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-theme-primary tabular-nums" style={{ fontFamily: 'Manrope' }}>{t.count}</p>
                {t.avg_ms > 0 && <span className="text-[10px] font-mono text-theme-dimmed">{formatDuration(Math.round(t.avg_ms))} avg</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent Activity Bars (only in stream mode) */}
      {viewMode === 'stream' && stats?.by_agent?.length > 0 && showStats && (
        <div className="bg-surface-card border border-subtle rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono text-theme-faint uppercase tracking-wider">Activity by Agent</h3>
            <button onClick={() => setShowStats(false)} className="text-[10px] text-theme-dimmed hover:text-theme-faint">Hide stats</button>
          </div>
          <div className="space-y-2">
            {stats.by_agent.map(a => {
              const max = Math.max(...stats.by_agent.map(x => x.count));
              const pct = max > 0 ? (a.count / max) * 100 : 0;
              return (
                <div key={a._id} className="flex items-center gap-3">
                  <span className={`text-xs font-mono w-20 truncate ${agentColor(a._id)}`}>
                    {a._id || 'unknown'}
                  </span>
                  <div className="flex-1 h-4 bg-surface-card rounded-sm overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-orange-600/80 to-orange-500/40 rounded-sm transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                    {a.errors > 0 && (
                      <div
                        className="absolute top-0 right-0 h-full bg-red-500/40 rounded-sm"
                        style={{ width: `${(a.errors / a.count) * pct}%` }}
                      />
                    )}
                  </div>
                  <span className="text-xs font-mono text-theme-muted w-10 text-right tabular-nums">{a.count}</span>
                  {a.errors > 0 && <span className="text-[10px] font-mono text-red-500 w-8 tabular-nums">{a.errors}e</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'stream' && !showStats && (
        <button onClick={() => setShowStats(true)} className="text-xs text-theme-dimmed hover:text-theme-muted flex items-center gap-1 transition-colors">
          <BarChart3 className="w-3.5 h-3.5" /> Show stats
        </button>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-theme-dimmed">
          <Filter className="w-3.5 h-3.5" /> Filters:
        </div>
        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="w-40 h-8 bg-surface-sunken border-subtle text-xs"><SelectValue placeholder="All Agents" /></SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterEvent} onValueChange={setFilterEvent}>
          <SelectTrigger className="w-36 h-8 bg-surface-sunken border-subtle text-xs"><SelectValue placeholder="All Events" /></SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            {EVENT_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32 h-8 bg-surface-sunken border-subtle text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            {STATUS_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[10px] font-mono text-theme-dimmed ml-auto tabular-nums">
          {filteredActivities.length !== activities.length
            ? `${filteredActivities.length} / ${activities.length} events`
            : `${activities.length} events`}
          {viewMode === 'agents' && agentGroups.length > 0 && (
            <> &middot; {agentGroups.length} agent{agentGroups.length !== 1 ? 's' : ''}</>
          )}
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activities.length === 0 && agents.length === 0 ? (
        <div className="bg-surface-card border border-subtle rounded-lg p-12 text-center">
          <Activity className="w-12 h-12 text-theme-dimmed mx-auto mb-3" />
          <p className="text-theme-faint mb-2">No activities yet</p>
          <p className="text-xs text-theme-dimmed">Turn on Live mode to stream real-time gateway activities</p>
        </div>
      ) : viewMode === 'agents' ? (
        /* ═══ AGENTS VIEW ═══ */
        <div className="space-y-4">
          {/* Agent Detail Panel */}
          {selectedAgent && (
            <AgentDetailPanel
              agentInfo={selectedAgent}
              detail={agentDetail}
              loadingDetail={loadingDetail}
              activities={filteredActivities.filter(a =>
                (a.agent_name || a.agent_id) === (selectedAgent.name || selectedAgent.id)
              )}
              onClose={() => { setSelectedAgent(null); setAgentDetail(null); }}
            />
          )}

          {/* Agent Cards */}
          {agentGroups.map(([agentName, { activities: acts, agentInfo }]) => (
            <AgentCard
              key={agentName}
              agentName={agentName}
              agentInfo={agentInfo}
              activities={acts}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onSelectAgent={handleSelectAgent}
              isSelected={selectedAgent?.name === agentName}
            />
          ))}
        </div>
      ) : (
        /* ═══ STREAM VIEW ═══ */
        <div className="bg-surface-card border border-subtle rounded-lg overflow-hidden" ref={scrollRef}>
          {/* Stream Header */}
          <div className="px-4 py-2 bg-surface-header border-b border-subtle flex items-center gap-3">
            <Terminal className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-mono text-theme-faint">Activity Stream</span>
            {autoRefresh && wsConnected ? (
              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-500 ml-auto">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
              </span>
            ) : autoRefresh && !wsConnected ? (
              <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500 ml-auto">
                RECONNECTING
              </span>
            ) : null}
          </div>
          {/* Activity Rows */}
          <div className="max-h-[600px] overflow-y-auto">
            {filteredActivities.filter(a => !HIDDEN_AGENTS.includes(a.agent_name || a.agent_id)).map(act => (
              <ActivityRow
                key={act.id}
                act={act}
                isExpanded={expanded[act.id]}
                onToggle={() => toggleExpand(act.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
