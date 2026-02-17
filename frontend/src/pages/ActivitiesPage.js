import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getActivities, getActivitiesStats, simulateActivities, clearActivities, getAgents } from '../lib/api';
import {
  Activity, Bot, Wrench, MessageSquare, Cpu, Zap, Clock,
  ChevronDown, ChevronRight, RefreshCw, Trash2, Play, Pause,
  AlertTriangle, CheckCircle, XCircle, Loader, Ban, Terminal,
  Filter, BarChart3, ArrowDown
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
    session_end: 'text-zinc-500 bg-zinc-800 border-zinc-700',
    heartbeat: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  };
  return colors[type] || 'text-zinc-500 bg-zinc-800 border-zinc-700';
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
    cancelled: 'text-zinc-500 bg-zinc-800 border-zinc-700',
  };
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${cls[status] || cls.cancelled}`}>
      {status}
    </span>
  );
}

function agentColor(name) {
  const colors = ['text-orange-500', 'text-sky-500', 'text-emerald-500', 'text-violet-500', 'text-pink-500', 'text-amber-500'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
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

function ActivityRow({ act, isExpanded, onToggle }) {
  const Icon = eventIcon(act.event_type);

  return (
    <div
      data-testid={`activity-row-${act.id}`}
      className={`border-b border-zinc-800/30 transition-colors ${
        act.status === 'error' ? 'bg-red-500/[0.03]' :
        act.status === 'running' ? 'bg-sky-500/[0.02]' :
        'hover:bg-white/[0.015]'
      }`}
    >
      {/* Main Row */}
      <div
        className="px-4 py-2.5 flex items-center gap-3 cursor-pointer select-none"
        onClick={onToggle}
      >
        {/* Expand Arrow */}
        <button className="text-zinc-600 hover:text-zinc-400 transition-colors w-4 shrink-0">
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Status Indicator */}
        <div className="shrink-0">{statusIndicator(act.status)}</div>

        {/* Timestamp */}
        <span className="text-[10px] font-mono text-zinc-600 w-16 shrink-0 tabular-nums">
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
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 shrink-0">
            {act.event_type}
          </span>
          {act.tool_name && (
            <span className="text-xs font-mono text-zinc-300">{act.tool_name}</span>
          )}
          {act.tool_input && (
            <span className="text-xs text-zinc-500 truncate">{act.tool_input}</span>
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
            act.duration_ms > 10000 ? 'text-amber-500' : act.duration_ms > 5000 ? 'text-zinc-400' : 'text-zinc-600'
          }`}>
            {formatDuration(act.duration_ms)}
          </span>
        )}

        {/* Tokens */}
        {act.tokens_in > 0 && (
          <span className="text-[10px] font-mono text-zinc-600 shrink-0 tabular-nums">
            {act.tokens_in}+{act.tokens_out}t
          </span>
        )}

        {/* Channel */}
        {act.channel && (
          <span className="text-[10px] font-mono text-zinc-700 shrink-0">{act.channel}</span>
        )}
      </div>

      {/* Expanded Verbose Section */}
      {isExpanded && (
        <div className="px-4 pb-3 ml-8 animate-fade-in">
          <div className="bg-[#050505] border border-zinc-800/60 rounded-lg overflow-hidden">
            {/* Verbose Header */}
            <div className="px-3 py-1.5 bg-[#0a0a0a] border-b border-zinc-800/40 flex items-center gap-2">
              <Terminal className="w-3 h-3 text-zinc-600" />
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Verbose Output</span>
              {act.session_key && <span className="text-[10px] font-mono text-zinc-700 ml-auto truncate max-w-[300px]">{act.session_key}</span>}
            </div>
            {/* Verbose Content */}
            <pre className="px-3 py-2.5 text-xs font-mono text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
              {act.verbose || 'No verbose output'}
            </pre>
            {/* Detail Footer */}
            <div className="px-3 py-1.5 bg-[#0a0a0a] border-t border-zinc-800/40 flex flex-wrap items-center gap-3 text-[10px] font-mono text-zinc-600">
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
                <div className="bg-[#050505] border border-zinc-800/40 rounded p-2">
                  <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider">Input</span>
                  <p className="text-xs font-mono text-zinc-400 mt-1">{act.tool_input}</p>
                </div>
              )}
              {act.tool_output && (
                <div className="bg-[#050505] border border-zinc-800/40 rounded p-2">
                  <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider">Output</span>
                  <p className="text-xs font-mono text-zinc-400 mt-1">{act.tool_output}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState(null);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterEvent, setFilterEvent] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showStats, setShowStats] = useState(true);
  const intervalRef = useRef(null);
  const scrollRef = useRef(null);

  const load = useCallback(async (isPolling = false) => {
    try {
      const params = {
        agent_id: filterAgent === 'all' ? '' : filterAgent,
        event_type: filterEvent === 'all' ? '' : filterEvent,
        status: filterStatus === 'all' ? '' : filterStatus,
        limit: 200,
      };
      const [actRes, statsRes] = await Promise.all([
        getActivities(params),
        getActivitiesStats(),
      ]);
      setActivities(actRes.data);
      setStats(statsRes.data);
      if (!isPolling) {
        const agRes = await getAgents();
        setAgents(agRes.data);
      }
    } catch (e) {
      if (!isPolling) toast.error('Failed to load activities');
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [filterAgent, filterEvent, filterStatus]);

  useEffect(() => { load(false); }, [load]);

  // Auto-refresh polling
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        simulateActivities().then(() => load(true));
      }, 4000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, load]);

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all activity history?')) return;
    try { await clearActivities(); toast.success('Activities cleared'); load(false); }
    catch { toast.error('Failed to clear'); }
  };

  const handleSimulate = async () => {
    try { await simulateActivities(); load(true); }
    catch { toast.error('Simulation failed'); }
  };

  return (
    <div data-testid="activities-page" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Activities
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Real-time agent behavior monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Live Toggle */}
          <div className="flex items-center gap-2 bg-[#0c0c0e] border border-zinc-800/60 rounded-lg px-3 py-2">
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`}
              style={autoRefresh ? { boxShadow: '0 0 8px rgba(16,185,129,0.6)' } : {}} />
            <Label className="text-xs text-zinc-400 cursor-pointer" htmlFor="auto-refresh">Live</Label>
            <Switch
              id="auto-refresh"
              data-testid="live-toggle"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSimulate} className="border-zinc-700 text-zinc-400 hover:bg-zinc-800" data-testid="simulate-btn">
            <Play className="w-3.5 h-3.5 mr-1" /> Simulate
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-red-500" data-testid="clear-activities-btn">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && showStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-3">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-mono">Total</p>
            <p className="text-xl font-bold text-zinc-200 tabular-nums" style={{ fontFamily: 'Manrope' }}>{stats.total}</p>
          </div>
          <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-3">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-mono">Running</p>
            <p className="text-xl font-bold text-sky-500 tabular-nums" style={{ fontFamily: 'Manrope' }}>{stats.running}</p>
          </div>
          <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-3">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-mono">Errors</p>
            <p className="text-xl font-bold text-red-500 tabular-nums" style={{ fontFamily: 'Manrope' }}>{stats.errors}</p>
          </div>
          {/* Top tools */}
          {stats.by_tool?.slice(0, 3).map(t => (
            <div key={t._id} className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-3">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-mono">{t._id}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-zinc-200 tabular-nums" style={{ fontFamily: 'Manrope' }}>{t.count}</p>
                {t.avg_ms > 0 && <span className="text-[10px] font-mono text-zinc-600">{formatDuration(Math.round(t.avg_ms))} avg</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent Activity Bars */}
      {stats?.by_agent?.length > 0 && showStats && (
        <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Activity by Agent</h3>
            <button onClick={() => setShowStats(false)} className="text-[10px] text-zinc-700 hover:text-zinc-500">Hide stats</button>
          </div>
          <div className="space-y-2">
            {stats.by_agent.map(a => {
              const max = Math.max(...stats.by_agent.map(x => x.count));
              const pct = max > 0 ? (a.count / max) * 100 : 0;
              return (
                <div key={a._id} className="flex items-center gap-3">
                  <span className={`text-xs font-mono w-20 truncate ${agentColor(a._id)}`}>
                    {agents.find(ag => ag.id === a._id)?.name || a._id.slice(0, 8)}
                  </span>
                  <div className="flex-1 h-4 bg-zinc-900 rounded-sm overflow-hidden relative">
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
                  <span className="text-xs font-mono text-zinc-400 w-10 text-right tabular-nums">{a.count}</span>
                  {a.errors > 0 && <span className="text-[10px] font-mono text-red-500 w-8 tabular-nums">{a.errors}e</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!showStats && (
        <button onClick={() => setShowStats(true)} className="text-xs text-zinc-600 hover:text-zinc-400 flex items-center gap-1 transition-colors">
          <BarChart3 className="w-3.5 h-3.5" /> Show stats
        </button>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-zinc-600">
          <Filter className="w-3.5 h-3.5" /> Filters:
        </div>
        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="w-40 h-8 bg-[#050505] border-zinc-800 text-xs"><SelectValue placeholder="All Agents" /></SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterEvent} onValueChange={setFilterEvent}>
          <SelectTrigger className="w-36 h-8 bg-[#050505] border-zinc-800 text-xs"><SelectValue placeholder="All Events" /></SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            {EVENT_TYPES.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32 h-8 bg-[#050505] border-zinc-800 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            {STATUS_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[10px] font-mono text-zinc-600 ml-auto tabular-nums">{activities.length} events</span>
      </div>

      {/* Activity Stream */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activities.length === 0 ? (
        <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-12 text-center">
          <Activity className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 mb-2">No activities yet</p>
          <p className="text-xs text-zinc-600">Turn on Live mode or click Simulate to generate demo data</p>
        </div>
      ) : (
        <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg overflow-hidden" ref={scrollRef}>
          {/* Stream Header */}
          <div className="px-4 py-2 bg-[#101012] border-b border-zinc-800/60 flex items-center gap-3">
            <Terminal className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-mono text-zinc-500">Activity Stream</span>
            {autoRefresh && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-500 ml-auto">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE
              </span>
            )}
          </div>
          {/* Activity Rows */}
          <div className="max-h-[600px] overflow-y-auto">
            {activities.map(act => (
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
