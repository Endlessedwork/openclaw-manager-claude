import React, { useEffect, useState } from 'react';
import { getChannels, updateChannel } from '../lib/api';
import { Wifi, WifiOff, MessageCircle, Pencil, X, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useGatewayBanner } from '../contexts/GatewayBannerContext';


const channelColors = {
  whatsapp: 'bg-green-500/10', telegram: 'bg-sky-500/10', discord: 'bg-indigo-500/10',
  slack: 'bg-purple-500/10', signal: 'bg-blue-500/10', imessage: 'bg-green-400/10',
  googlechat: 'bg-emerald-500/10', webchat: 'bg-orange-500/10', irc: 'bg-gray-500/10',
  matrix: 'bg-teal-500/10', msteams: 'bg-violet-500/10', line: 'bg-green-500/10',
  nostr: 'bg-purple-500/10', feishu: 'bg-blue-500/10', mattermost: 'bg-blue-600/10',
};

const ChannelLogo = ({ type, size = 20 }) => {
  const s = size;
  const logos = {
    telegram: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.37.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" fill="#29B6F6"/>
      </svg>
    ),
    whatsapp: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" fill="#25D366"/>
      </svg>
    ),
    discord: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="#5865F2"/>
      </svg>
    ),
    slack: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.163 0a2.528 2.528 0 012.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.163 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 01-2.52-2.523 2.527 2.527 0 012.52-2.52h6.315A2.528 2.528 0 0124 15.163a2.528 2.528 0 01-2.522 2.523h-6.315z" fill="#E01E5A"/>
      </svg>
    ),
    signal: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.105 21.2a1 1 0 001.195 1.195l4.032-1.333A9.956 9.956 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fill="#3A76F0"/>
      </svg>
    ),
    line: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386a.63.63 0 01-.63-.629V8.108a.63.63 0 01.63-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016a.63.63 0 01-.63.629.618.618 0 01-.51-.262l-2.397-3.274v2.906a.63.63 0 01-.63.63.63.63 0 01-.63-.63V8.108a.63.63 0 01.63-.63c.2 0 .385.096.504.259l2.403 3.274V8.108a.63.63 0 011.26 0v4.771zm-5.741 0a.63.63 0 01-1.26 0V8.108a.63.63 0 011.26 0v4.771zm-2.527.629H4.856a.63.63 0 01-.63-.629V8.108a.63.63 0 011.26 0v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629zM24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.121.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" fill="#06C755"/>
      </svg>
    ),
    msteams: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M20.625 8.5h-3.75c-.207 0-.375.168-.375.375v6.75a3.375 3.375 0 01-3.375 3.375H9.75a.375.375 0 00-.375.375v.75c0 1.243 1.007 2.25 2.25 2.25h5.55l2.7 1.8a.375.375 0 00.6-.3v-1.5h.15c1.243 0 2.25-1.007 2.25-2.25v-9.375c0-1.243-1.007-2.25-2.25-2.25z" fill="#5059C9"/>
        <circle cx="19.5" cy="5.25" r="2.25" fill="#5059C9"/>
        <path d="M14.625 5.25a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" fill="#7B83EB"/>
        <path d="M16.5 9.75v6a4.5 4.5 0 01-9 0v-6a1.5 1.5 0 011.5-1.5h6a1.5 1.5 0 011.5 1.5z" fill="#7B83EB"/>
      </svg>
    ),
    matrix: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.309-.443.683-.784 1.117-1.024.433-.245.936-.365 1.5-.365.54 0 1.033.107 1.488.32.45.214.795.59 1.033 1.13.254-.355.6-.67 1.05-.946a2.89 2.89 0 011.53-.404c.867 0 1.545.27 2.033.81.49.54.733 1.34.733 2.4V17.2h-2.1v-5.09c0-.405-.017-.795-.05-1.17a2.28 2.28 0 00-.233-.953 1.4 1.4 0 00-.567-.637c-.246-.157-.567-.237-.966-.237-.4 0-.717.086-.966.258a1.72 1.72 0 00-.567.657c-.13.265-.2.565-.234.903a7.39 7.39 0 00-.05.844v5.424h-2.1v-4.98c0-.34-.008-.68-.025-1.02a3.17 3.17 0 00-.175-.99 1.37 1.37 0 00-.508-.72c-.233-.19-.583-.283-1.05-.283-.133 0-.3.03-.5.09-.2.063-.383.17-.55.32a1.82 1.82 0 00-.433.617c-.117.258-.175.6-.175 1.025V17.2h-2.1V7.81h2.033zm15.042 15.64V.55H21.07V0H24v24h-2.28v-.55z" fill="#0DBD8B"/>
      </svg>
    ),
    imessage: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.477 2 2 5.813 2 10.5c0 2.65 1.354 5.023 3.478 6.612-.189.93-.694 2.583-1.378 3.688.89-.267 2.378-.933 3.9-2.1A12.29 12.29 0 0012 19c5.523 0 10-3.813 10-8.5S17.523 2 12 2z" fill="#34C759"/>
      </svg>
    ),
    googlechat: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M12 0L4 4v8l8 4 8-4V4l-8-4z" fill="#00AC47"/>
        <path d="M12 0L4 4v8l8-4V0z" fill="#00832D"/>
        <path d="M12 8l8-4v8l-8 4V8z" fill="#2684FC"/>
        <path d="M4 12l8 4v-8L4 4v8z" fill="#00AC47"/>
        <path d="M12 8v8l8-4V4l-8 4z" fill="#0066DA"/>
        <path d="M4 12v4l4 4h4l-8-8z" fill="#00AC47"/>
        <path d="M20 12v4l-4 4h-4l8-8z" fill="#2684FC"/>
      </svg>
    ),
    nostr: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 14.5c-1 .5-2.2.5-3.5.5s-2.5 0-3.5-.5C7 15.75 6 14.5 6 12.5S7.5 8 9 7s2.5-1 3-1 1.5 0 3 1 3 3 3 5.5-1 3.25-2.5 4z" fill="#8B5CF6"/>
      </svg>
    ),
    feishu: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M4 6.5C4 5.12 5.12 4 6.5 4h4.42c.93 0 1.67.75 1.67 1.67v4.42c0 1.38-1.12 2.5-2.5 2.5H6.5C5.12 12.59 4 11.47 4 10.09V6.5z" fill="#3370FF"/>
        <path d="M11.41 11.41c0-1.38 1.12-2.5 2.5-2.5h3.59c1.38 0 2.5 1.12 2.5 2.5v3.59c0 1.38-1.12 2.5-2.5 2.5h-4.42c-.93 0-1.67-.75-1.67-1.67v-4.42z" fill="#3370FF"/>
      </svg>
    ),
    mattermost: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M12.081 2C6.513 2 2.002 6.435 2.002 11.913c0 2.05.64 3.95 1.727 5.52L2 22l4.728-1.69a10.09 10.09 0 005.353 1.527c5.568 0 10.079-4.435 10.079-9.913S17.649 2 12.081 2zm.008 2.088c4.452 0 8.071 3.565 8.071 7.965 0 4.4-3.619 7.965-8.071 7.965a8.12 8.12 0 01-4.37-1.265l-.535-.338-2.96 1.058 1.084-2.892-.37-.563a7.87 7.87 0 01-1.277-4.295V12c.178-4.227 3.738-7.61 8.12-7.87l.308-.042z" fill="#2D69B4"/>
      </svg>
    ),
    irc: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M2 4a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H6l-4 4V4z" fill="#6B7280"/>
        <text x="6" y="13.5" fontSize="7" fontWeight="bold" fill="white" fontFamily="monospace">IRC</text>
      </svg>
    ),
    webchat: (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 5.81 2 10.5c0 2.49 1.28 4.74 3.33 6.3L4 22l4.5-2.25c1.1.33 2.28.5 3.5.5 5.52 0 10-3.81 10-8.75S17.52 2 12 2z" fill="#F97316"/>
        <circle cx="8" cy="10.5" r="1.25" fill="white"/>
        <circle cx="12" cy="10.5" r="1.25" fill="white"/>
        <circle cx="16" cy="10.5" r="1.25" fill="white"/>
      </svg>
    ),
  };
  return logos[type] || <MessageCircle className="w-5 h-5 text-theme-muted" />;
};


export default function ChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ dmPolicy: 'open', groupPolicy: 'mention', allowFrom: '', streaming: 'off', groupAllowlist: '' });
  const [saving, setSaving] = useState(false);
  const { canEdit } = useAuth();
  const { markRestartNeeded } = useGatewayBanner();

  const load = async () => {
    try { const res = await getChannels(); setChannels(res.data); }
    catch { toast.error('Failed to load channels'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openEdit = (ch) => {
    setEditing(ch);
    setForm({
      dmPolicy: ch.dm_policy || 'open',
      groupPolicy: ch.group_policy || 'mention',
      allowFrom: (ch.allow_from || []).join(', '),
      streaming: ch.streaming || 'off',
      groupAllowlist: (ch.group_allowlist || []).join('\n'),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        dmPolicy: form.dmPolicy,
        groupPolicy: form.groupPolicy,
        allowFrom: form.allowFrom.split(',').map(s => s.trim()).filter(Boolean),
        streaming: form.streaming,
        groupAllowlist: form.groupAllowlist.split('\n').map(s => s.trim()).filter(Boolean),
      };
      await updateChannel(editing.id, payload);
      toast.success(`Channel ${editing.display_name} updated`);
      markRestartNeeded();
      setDialogOpen(false);
      setTimeout(load, 2000);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="channels-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Channels</h1>
          <p className="text-sm text-theme-faint mt-1">Configure messaging channels and DM policies</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels.map(ch => (
            <div key={ch.id} data-testid={`channel-card-${ch.id}`} className="bg-surface-card border border-subtle rounded-lg hover:border-orange-500/20 transition-all duration-300">
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${channelColors[ch.channel_type] || 'bg-muted'}`}>
                      <ChannelLogo type={ch.channel_type} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-theme-primary">{ch.display_name || ch.channel_type}</h3>
                      <span className="text-[10px] font-mono text-theme-faint uppercase">{ch.channel_type}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit() && (
                      <button data-testid={`edit-channel-${ch.id}`} onClick={() => openEdit(ch)} className="p-1.5 rounded-md hover:bg-white/5 text-theme-dimmed hover:text-orange-400 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {ch.enabled ? (
                      <span className="flex items-center gap-1 text-xs font-mono text-emerald-500"><Wifi className="w-3 h-3" /> {ch.status}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-mono text-theme-dimmed"><WifiOff className="w-3 h-3" /> off</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-theme-dimmed">DM Policy</span><span className="font-mono text-theme-muted">{ch.dm_policy}</span></div>
                  <div className="flex justify-between"><span className="text-theme-dimmed">Group Policy</span><span className="font-mono text-theme-muted">{ch.group_policy}</span></div>
                  {ch.streaming && ch.streaming !== 'off' && (
                    <div className="flex justify-between"><span className="text-theme-dimmed">Streaming</span><span className="font-mono text-theme-muted">{ch.streaming}</span></div>
                  )}
                  {ch.allow_from?.length > 0 && (
                    <div className="flex justify-between"><span className="text-theme-dimmed">Allow From</span><span className="font-mono text-theme-muted truncate max-w-[200px]">{ch.allow_from.join(', ')}</span></div>
                  )}
                  {ch.group_allowlist?.length > 0 && (
                    <div className="flex justify-between"><span className="text-theme-dimmed">Group Allowlist</span><span className="font-mono text-theme-muted">{ch.group_allowlist.length} group(s)</span></div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-md">
          <DialogHeader>
            <DialogTitle className="text-theme-primary flex items-center justify-between">
              Edit {editing?.display_name} Settings
              <button onClick={() => setDialogOpen(false)} className="text-theme-dimmed hover:text-theme-muted"><X className="w-4 h-4" /></button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-theme-muted text-xs">DM Policy</Label>
              <Select value={form.dmPolicy} onValueChange={v => setForm(f => ({ ...f, dmPolicy: v }))}>
                <SelectTrigger className="bg-surface-base border-strong text-theme-primary mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">open</SelectItem>
                  <SelectItem value="pairing">pairing</SelectItem>
                  <SelectItem value="allowlist">allowlist</SelectItem>
                  <SelectItem value="off">off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-theme-muted text-xs">Group Policy</Label>
              <Select value={form.groupPolicy} onValueChange={v => setForm(f => ({ ...f, groupPolicy: v }))}>
                <SelectTrigger className="bg-surface-base border-strong text-theme-primary mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mention">mention</SelectItem>
                  <SelectItem value="allowlist">allowlist</SelectItem>
                  <SelectItem value="open">open</SelectItem>
                  <SelectItem value="off">off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.groupPolicy === 'allowlist' && (
              <div>
                <Label className="text-theme-muted text-xs">Group Allowlist</Label>
                <Textarea
                  data-testid="group-allowlist-input"
                  value={form.groupAllowlist}
                  onChange={e => setForm(f => ({ ...f, groupAllowlist: e.target.value }))}
                  placeholder="One group ID per line"
                  className="bg-surface-base border-strong text-theme-primary font-mono text-xs mt-1 min-h-[80px]"
                />
                <p className="text-[10px] text-theme-faint mt-1">One group/chat ID per line</p>
              </div>
            )}
            <div>
              <Label className="text-theme-muted text-xs">Allow From</Label>
              <Input
                value={form.allowFrom}
                onChange={e => setForm(f => ({ ...f, allowFrom: e.target.value }))}
                placeholder="* or comma-separated user IDs"
                className="bg-surface-base border-strong text-theme-primary font-mono text-xs mt-1"
              />
              <p className="text-[10px] text-theme-faint mt-1">Use * to allow all, or comma-separated user IDs</p>
            </div>
            <div>
              <Label className="text-theme-muted text-xs">Streaming</Label>
              <Select value={form.streaming} onValueChange={v => setForm(f => ({ ...f, streaming: v }))}>
                <SelectTrigger className="bg-surface-base border-strong text-theme-primary mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">off</SelectItem>
                  <SelectItem value="on">on</SelectItem>
                  <SelectItem value="adaptive">adaptive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} className="border-strong text-theme-muted">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
