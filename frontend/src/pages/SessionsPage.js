import React, { useEffect, useState } from 'react';
import { getSessions, deleteSession } from '../lib/api';
import { MessageSquare, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

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

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this session?')) return;
    try { await deleteSession(id); toast.success('Session deleted'); load(); }
    catch { toast.error('Failed'); }
  };

  const statusColor = (s) => s === 'active' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : 'text-zinc-500 bg-zinc-800 border-zinc-700';
  const channelColor = (ch) => {
    const c = { whatsapp: 'text-green-500', telegram: 'text-sky-500', discord: 'text-indigo-500', webchat: 'text-orange-500' };
    return c[ch] || 'text-zinc-400';
  };

  return (
    <div data-testid="sessions-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Sessions</h1>
          <p className="text-sm text-zinc-500 mt-1">View active and recent chat sessions</p>
        </div>
        <Button data-testid="refresh-sessions-btn" variant="outline" onClick={load} className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : sessions.length === 0 ? (
        <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-12 text-center">
          <MessageSquare className="w-12 h-12 text-zinc-700 mx-auto mb-3" /><p className="text-zinc-500">No sessions found</p>
        </div>
      ) : (
        <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg divide-y divide-zinc-800/40">
          {sessions.map(s => (
            <div key={s.id} data-testid={`session-row-${s.id}`} className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                    <MessageSquare className={`w-4 h-4 ${channelColor(s.channel)}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-mono text-zinc-200 truncate">{s.session_key}</h3>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${statusColor(s.status)}`}>{s.status}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                      <span>Agent: <span className="font-mono text-zinc-400">{s.agent_id}</span></span>
                      <span>Channel: <span className={`font-mono ${channelColor(s.channel)}`}>{s.channel || '-'}</span></span>
                      <span>Peer: <span className="font-mono text-zinc-400">{s.peer || '-'}</span></span>
                      <span>Messages: <span className="font-mono text-zinc-400">{s.message_count}</span></span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-xs font-mono text-zinc-600">
                    {s.last_message_at ? new Date(s.last_message_at).toLocaleString() : '-'}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
