import React, { useEffect, useState } from 'react';
import { getSessions } from '../lib/api';
import { MessageSquare, RefreshCw, Clock, Cpu, Bot, Hash, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

function formatAge(ms) {
  if (!ms) return '-';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function formatTokens(n) {
  if (!n) return '0';
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const res = await getSessions(100); setSessions(res.data); }
    catch { toast.error('Failed to load sessions'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const kindStyle = (k) => {
    if (k === 'direct') return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
    if (k === 'group') return 'text-violet-400 bg-violet-500/10 border-violet-500/20';
    return 'text-theme-faint bg-muted border-strong';
  };

  const channelStyle = (ch) => {
    const styles = {
      telegram: { color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
      line: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
      discord: { color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
      whatsapp: { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
      webchat: { color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
    };
    return styles[ch] || { color: 'text-theme-muted', bg: 'bg-muted border-strong' };
  };

  const parseSessionKey = (key) => {
    // key format: "agent:<agentName>:<channel>:<kind>:<kind>:<id>" or variations
    const parts = key.split(':');
    // Extract the last part as ID (often a numeric or unique identifier)
    const id = parts.length > 3 ? parts.slice(-1)[0] : key;
    // Short ID for display
    const shortId = id.length > 8 ? id.slice(-8) : id;
    return shortId;
  };

  return (
    <div data-testid="sessions-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Sessions</h1>
          <p className="text-sm text-theme-faint mt-1">Live sessions from gateway ({sessions.length} total)</p>
        </div>
        <Button data-testid="refresh-sessions-btn" variant="outline" onClick={load} className="border-strong text-theme-muted hover:bg-muted">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {!loading && sessions.filter(s => s.is_fallback).length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="text-sm">
            <span className="text-amber-400 font-medium">{sessions.filter(s => s.is_fallback).length} sessions</span>
            <span className="text-theme-faint"> using fallback models instead of primary</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : sessions.length === 0 ? (
        <div className="bg-surface-card border border-subtle rounded-lg p-12 text-center">
          <MessageSquare className="w-12 h-12 text-theme-dimmed mx-auto mb-3" /><p className="text-theme-faint">No sessions found</p>
        </div>
      ) : (
        <div className="bg-surface-card border border-subtle rounded-lg divide-y divide-subtle">
          {sessions.map(s => (
            <div key={s.id} data-testid={`session-row-${s.id}`} className="px-5 py-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${channelStyle(s.channel).bg}`}>
                    <MessageSquare className={`w-4 h-4 ${channelStyle(s.channel).color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border bg-orange-500/10 border-orange-500/20 text-orange-400">
                        <Bot className="w-3 h-3" />
                        {s.agent}
                      </span>
                      {s.channel && (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${channelStyle(s.channel).bg} ${channelStyle(s.channel).color}`}>
                          {s.channel}
                        </span>
                      )}
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border uppercase tracking-wider ${kindStyle(s.kind)}`}>
                        {s.kind}
                      </span>
                      <span className="text-[11px] font-mono text-theme-dimmed flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {parseSessionKey(s.session_key)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-theme-faint">
                      {s.model && (
                        <span className="inline-flex items-center gap-1">
                          <Cpu className={`w-3 h-3 ${s.is_fallback ? 'text-amber-400' : 'text-violet-400'}`} />
                          <span className={`font-mono ${s.is_fallback ? 'text-amber-400' : 'text-violet-400'}`}>{s.model}</span>
                          {s.is_fallback && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/20 text-amber-400 uppercase tracking-wider" title={`Expected: ${s.primary_model}`}>
                              fallback
                            </span>
                          )}
                        </span>
                      )}
                      <span className="font-mono">
                        <span className="text-theme-muted">{formatTokens(s.total_tokens)}</span>
                        <span className="text-theme-dimmed"> / </span>
                        <span className="text-theme-faint">{formatTokens(s.context_tokens)} ctx</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-mono text-theme-dimmed ml-4">
                  <Clock className="w-3 h-3" />
                  {formatAge(s.age_ms)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
