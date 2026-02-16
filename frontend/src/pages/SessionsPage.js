import React, { useEffect, useState } from 'react';
import { getSessions, deleteSession, getSessionMessages } from '../lib/api';
import { MessageSquare, Trash2, RefreshCw, Eye, X, User, Bot, Wrench } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';

export default function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcript, setTranscript] = useState(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

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

  const handleViewTranscript = async (session) => {
    setLoadingTranscript(true);
    setTranscriptOpen(true);
    try {
      const res = await getSessionMessages(session.id);
      setTranscript(res.data);
    } catch { toast.error('Failed to load transcript'); }
    finally { setLoadingTranscript(false); }
  };

  const statusColor = (s) => s === 'active' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : 'text-zinc-500 bg-zinc-800 border-zinc-700';
  const channelColor = (ch) => {
    const c = { whatsapp: 'text-green-500', telegram: 'text-sky-500', discord: 'text-indigo-500', webchat: 'text-orange-500' };
    return c[ch] || 'text-zinc-400';
  };

  const roleIcon = (role) => {
    if (role === 'user') return <User className="w-3.5 h-3.5 text-sky-500" />;
    if (role === 'assistant') return <Bot className="w-3.5 h-3.5 text-orange-500" />;
    return <Wrench className="w-3.5 h-3.5 text-zinc-500" />;
  };
  const roleBg = (role) => {
    if (role === 'user') return 'bg-sky-500/5 border-sky-500/10';
    if (role === 'assistant') return 'bg-orange-500/5 border-orange-500/10';
    return 'bg-zinc-800/50 border-zinc-800';
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
                  <Button data-testid={`view-transcript-${s.id}`} variant="ghost" size="sm" onClick={() => handleViewTranscript(s)} className="text-zinc-500 hover:text-orange-500 hover:bg-orange-500/10">
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transcript Viewer Dialog */}
      <Dialog open={transcriptOpen} onOpenChange={setTranscriptOpen}>
        <DialogContent className="bg-[#0c0c0e] border-zinc-800 max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
              Session Transcript
            </DialogTitle>
            {transcript?.session && (
              <div className="flex items-center gap-3 text-xs font-mono text-zinc-500 mt-1">
                <span>{transcript.session.channel}</span>
                <span>{transcript.session.peer}</span>
                <span>{transcript.session.message_count} messages</span>
              </div>
            )}
          </DialogHeader>
          {loadingTranscript ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : transcript?.messages?.length > 0 ? (
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-3 mt-2">
                {transcript.messages.map((msg, i) => (
                  <div key={msg.id || i} data-testid={`transcript-msg-${i}`} className={`rounded-lg border p-3 ${roleBg(msg.role)}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      {roleIcon(msg.role)}
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{msg.role}</span>
                      <span className="text-[10px] font-mono text-zinc-700 ml-auto">
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="py-8 text-center text-sm text-zinc-600">No messages in this session</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
