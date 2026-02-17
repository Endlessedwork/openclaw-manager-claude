import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getSystemLogs, getSystemLogsStats, generateSystemLogs, clearSystemLogs } from '../lib/api';
import {
  Terminal, Search, Trash2, Play, Pause, ArrowDown, ArrowUp,
  Filter, X, AlertTriangle, XCircle, Info, Bug, ChevronDown
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const SOURCE_PRESETS = ['gateway', 'agent', 'channel', 'session', 'tool', 'skill', 'cron', 'hooks'];

function levelColor(level) {
  const c = {
    DEBUG: 'text-zinc-500',
    INFO: 'text-sky-400',
    WARN: 'text-amber-400',
    ERROR: 'text-red-400',
  };
  return c[level] || 'text-zinc-500';
}

function levelBg(level) {
  const c = {
    DEBUG: 'text-zinc-600 bg-zinc-800/50',
    INFO: 'text-sky-500 bg-sky-500/10',
    WARN: 'text-amber-500 bg-amber-500/10',
    ERROR: 'text-red-500 bg-red-500/10',
  };
  return c[level] || 'text-zinc-600 bg-zinc-800/50';
}

function sourceColor(source) {
  if (source.startsWith('gateway')) return 'text-orange-400';
  if (source.startsWith('agent:')) return 'text-emerald-400';
  if (source.startsWith('channel:')) return 'text-sky-400';
  if (source.startsWith('session')) return 'text-violet-400';
  if (source.startsWith('tool:')) return 'text-amber-400';
  if (source.startsWith('skill:')) return 'text-pink-400';
  if (source.startsWith('cron')) return 'text-teal-400';
  if (source.startsWith('hooks')) return 'text-blue-400';
  return 'text-zinc-500';
}

function LogLine({ log, isHighlighted, searchTerm }) {
  const ts = log.timestamp ? new Date(log.timestamp) : null;
  const timeStr = ts ? ts.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }) : '';

  const highlightText = (text) => {
    if (!searchTerm || !text) return text;
    const idx = text.toLowerCase().indexOf(searchTerm.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-amber-500/30 text-amber-200 rounded px-0.5">{text.slice(idx, idx + searchTerm.length)}</mark>
        {text.slice(idx + searchTerm.length)}
      </>
    );
  };

  return (
    <div
      data-testid={`log-line-${log.id}`}
      className={`flex items-start gap-0 px-3 py-[3px] font-mono text-[12px] leading-[20px] transition-colors hover:bg-white/[0.02] ${
        log.level === 'ERROR' ? 'bg-red-500/[0.04]' :
        log.level === 'WARN' ? 'bg-amber-500/[0.02]' :
        isHighlighted ? 'bg-sky-500/[0.03]' : ''
      }`}
    >
      {/* Timestamp */}
      <span className="text-zinc-600 w-[95px] shrink-0 tabular-nums select-all">{timeStr}</span>

      {/* Level */}
      <span className={`w-[52px] shrink-0 font-semibold ${levelColor(log.level)}`}>
        {log.level}
      </span>

      {/* Source */}
      <span className={`w-[160px] shrink-0 truncate ${sourceColor(log.source)}`}>
        [{log.source}]
      </span>

      {/* Message */}
      <span className="text-zinc-300 flex-1 break-words">
        {searchTerm ? highlightText(log.message) : log.message}
      </span>
    </div>
  );
}

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(true);
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [levelFilters, setLevelFilters] = useState(new Set(LEVELS));
  const [sourceFilter, setSourceFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const scrollRef = useRef(null);
  const intervalRef = useRef(null);
  const bottomRef = useRef(null);

  const load = useCallback(async (isPolling = false) => {
    try {
      const params = { limit: 500 };
      if (sourceFilter) params.source = sourceFilter;
      if (activeSearch) params.search = activeSearch;
      const [logsRes, statsRes] = await Promise.all([
        getSystemLogs(params),
        isPolling ? Promise.resolve(null) : getSystemLogsStats(),
      ]);
      // Reverse to show oldest first (chronological)
      const sorted = [...logsRes.data].reverse();
      // Client-side level filter
      const filtered = sorted.filter(l => levelFilters.has(l.level));
      setLogs(filtered);
      if (statsRes) setStats(statsRes.data);
    } catch (e) {
      if (!isPolling) toast.error('Failed to load logs');
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [sourceFilter, activeSearch, levelFilters]);

  useEffect(() => { load(false); }, [load]);

  // Auto-refresh + generate
  useEffect(() => {
    if (!paused) {
      intervalRef.current = setInterval(() => {
        generateSystemLogs().then(() => load(true));
      }, 3000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [paused, load]);

  // Auto-scroll to bottom when following
  useEffect(() => {
    if (following && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, following]);

  const handleSearch = (e) => {
    e.preventDefault();
    setActiveSearch(search);
  };

  const toggleLevel = (level) => {
    setLevelFilters(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all logs?')) return;
    try { await clearSystemLogs(); toast.success('Logs cleared'); load(false); }
    catch { toast.error('Failed'); }
  };

  const scrollToBottom = () => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
      setFollowing(true);
    }
  };

  const scrollToTop = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setFollowing(false);
    }
  };

  // Detect manual scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setFollowing(atBottom);
  };

  return (
    <div data-testid="logs-page" className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header Bar */}
      <div className="shrink-0 flex items-center justify-between mb-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Logs</h1>
          <p className="text-sm text-zinc-500 mt-1">
            <span className="font-mono">openclaw logs --follow</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Follow indicator */}
          <div className="flex items-center gap-2 bg-[#0c0c0e] border border-zinc-800/60 rounded-lg px-3 py-2">
            <div className={`w-2 h-2 rounded-full transition-colors ${!paused ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`}
              style={!paused ? { boxShadow: '0 0 8px rgba(16,185,129,0.6)' } : {}} />
            <Label className="text-xs text-zinc-400 cursor-pointer" htmlFor="log-follow">
              {paused ? 'Paused' : 'Following'}
            </Label>
            <Switch id="log-follow" data-testid="follow-toggle" checked={!paused} onCheckedChange={v => setPaused(!v)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className={`border-zinc-700 text-zinc-400 hover:bg-zinc-800 ${showFilters ? 'bg-zinc-800 text-zinc-200' : ''}`}>
            <Filter className="w-3.5 h-3.5 mr-1" /> Filters
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-red-500" data-testid="clear-logs-btn">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      {showFilters && (
        <div className="shrink-0 bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-3 mb-3 animate-fade-in">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Level toggles */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider mr-1">Level:</span>
              {LEVELS.map(level => (
                <button
                  key={level}
                  data-testid={`filter-level-${level.toLowerCase()}`}
                  onClick={() => toggleLevel(level)}
                  className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-all ${
                    levelFilters.has(level)
                      ? `${levelBg(level)} border-current/20`
                      : 'text-zinc-700 bg-zinc-900 border-zinc-800 line-through'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>

            {/* Source filter */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-zinc-600 uppercase tracking-wider mr-1">Source:</span>
              {SOURCE_PRESETS.map(src => (
                <button
                  key={src}
                  data-testid={`filter-source-${src}`}
                  onClick={() => setSourceFilter(sourceFilter === src ? '' : src)}
                  className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-all ${
                    sourceFilter === src
                      ? 'text-orange-500 bg-orange-500/10 border-orange-500/20'
                      : 'text-zinc-600 bg-zinc-900 border-zinc-800 hover:text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {src}
                </button>
              ))}
              {sourceFilter && (
                <button onClick={() => setSourceFilter('')} className="text-zinc-600 hover:text-zinc-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="flex items-center gap-1.5 ml-auto">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                <Input
                  data-testid="log-search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-7 h-7 w-52 bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-xs"
                  placeholder="Search logs..."
                />
              </div>
              {activeSearch && (
                <button onClick={() => { setSearch(''); setActiveSearch(''); }} className="text-zinc-600 hover:text-zinc-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>
          </div>

          {/* Stats */}
          {stats && (
            <div className="flex items-center gap-4 mt-2 pt-2 border-t border-zinc-800/40 text-[10px] font-mono text-zinc-600">
              <span>{stats.total} total</span>
              <span className="text-red-500">{stats.errors} errors</span>
              <span className="text-amber-500">{stats.warnings} warnings</span>
              {stats.by_source?.slice(0, 5).map(s => (
                <span key={s._id} className={sourceColor(s._id)}>{s._id}: {s.count}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Terminal Log Viewer */}
      <div className="flex-1 min-h-0 bg-[#060608] border border-zinc-800/60 rounded-lg overflow-hidden flex flex-col">
        {/* Terminal Title Bar */}
        <div className="shrink-0 px-3 py-1.5 bg-[#0a0a0c] border-b border-zinc-800/40 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <Terminal className="w-3.5 h-3.5 text-zinc-600" />
          <span className="text-[11px] font-mono text-zinc-500">
            openclaw logs --follow {sourceFilter ? `--source ${sourceFilter}` : ''} {activeSearch ? `| grep "${activeSearch}"` : ''}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-mono tabular-nums text-zinc-700">{logs.length} lines</span>
            {following && !paused && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-500">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
        </div>

        {/* Log Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-zinc-600 font-mono">
            Waiting for log entries...
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden"
          >
            {logs.map(log => (
              <LogLine
                key={log.id}
                log={log}
                searchTerm={activeSearch}
                isHighlighted={false}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Bottom Bar */}
        <div className="shrink-0 px-3 py-1 bg-[#0a0a0c] border-t border-zinc-800/40 flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-700">
            {!paused ? 'Streaming...' : 'Paused'}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              data-testid="scroll-top-btn"
              onClick={scrollToTop}
              className="p-1 text-zinc-700 hover:text-zinc-400 transition-colors"
              title="Scroll to top"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              data-testid="scroll-bottom-btn"
              onClick={scrollToBottom}
              className={`p-1 transition-colors ${following ? 'text-emerald-500' : 'text-zinc-700 hover:text-zinc-400'}`}
              title="Scroll to bottom (follow)"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
