import React, { useEffect, useState } from 'react';
import { getChannels, createChannel, updateChannel, deleteChannel } from '../lib/api';
import { Radio, Plus, Pencil, Trash2, Wifi, WifiOff, MessageCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';

const CHANNEL_TYPES = ['whatsapp', 'telegram', 'discord', 'slack', 'signal', 'imessage', 'googlechat', 'webchat', 'irc', 'matrix', 'msteams', 'line', 'nostr', 'feishu', 'mattermost'];
const DM_POLICIES = ['pairing', 'allowlist', 'open', 'disabled'];

const channelIcon = (type) => {
  const colors = { whatsapp: 'text-green-500 bg-green-500/10', telegram: 'text-sky-500 bg-sky-500/10', discord: 'text-indigo-500 bg-indigo-500/10', slack: 'text-purple-500 bg-purple-500/10', webchat: 'text-orange-500 bg-orange-500/10' };
  return colors[type] || 'text-zinc-400 bg-zinc-800';
};

const EMPTY_CHANNEL = {
  channel_type: 'whatsapp', display_name: '', enabled: false,
  dm_policy: 'pairing', allow_from: [], group_policy: 'mention',
  group_allow_from: [], settings: {}, status: 'disconnected',
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_CHANNEL);

  const load = async () => {
    try { const res = await getChannels(); setChannels(res.data); }
    catch { toast.error('Failed to load channels'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_CHANNEL); setDialogOpen(true); };
  const openEdit = (ch) => { setEditing(ch); setForm(ch); setDialogOpen(true); };

  const handleSave = async () => {
    try {
      if (editing) { await updateChannel(editing.id, form); toast.success('Channel updated'); }
      else { await createChannel(form); toast.success('Channel created'); }
      setDialogOpen(false); load();
    } catch { toast.error('Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this channel?')) return;
    try { await deleteChannel(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed'); }
  };

  const handleToggle = async (ch) => {
    try {
      await updateChannel(ch.id, { ...ch, enabled: !ch.enabled, status: !ch.enabled ? 'connected' : 'disconnected' });
      toast.success(`Channel ${ch.enabled ? 'disabled' : 'enabled'}`); load();
    } catch { toast.error('Failed'); }
  };

  return (
    <div data-testid="channels-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Channels</h1>
          <p className="text-sm text-zinc-500 mt-1">Configure messaging channels and DM policies</p>
        </div>
        <Button data-testid="create-channel-btn" onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
          <Plus className="w-4 h-4 mr-2" /> Add Channel
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels.map(ch => (
            <div key={ch.id} data-testid={`channel-card-${ch.id}`} className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg hover:border-orange-500/20 transition-all duration-300">
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${channelIcon(ch.channel_type)}`}>
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-200">{ch.display_name || ch.channel_type}</h3>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase">{ch.channel_type}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ch.enabled ? (
                      <span className="flex items-center gap-1 text-xs font-mono text-emerald-500"><Wifi className="w-3 h-3" /> {ch.status}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-mono text-zinc-600"><WifiOff className="w-3 h-3" /> off</span>
                    )}
                    <Switch checked={ch.enabled} onCheckedChange={() => handleToggle(ch)} />
                  </div>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-zinc-600">DM Policy</span><span className="font-mono text-zinc-400">{ch.dm_policy}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-600">Group Policy</span><span className="font-mono text-zinc-400">{ch.group_policy}</span></div>
                  {ch.allow_from?.length > 0 && (
                    <div className="flex justify-between"><span className="text-zinc-600">Allow From</span><span className="font-mono text-zinc-400 truncate max-w-[200px]">{ch.allow_from.join(', ')}</span></div>
                  )}
                </div>
              </div>
              <div className="border-t border-zinc-800/60 px-5 py-3 flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => openEdit(ch)} className="text-zinc-500 hover:text-orange-500 hover:bg-orange-500/10"><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(ch.id)} className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0c0c0e] border-zinc-800 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>{editing ? 'Edit Channel' : 'Add Channel'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400 text-xs">Channel Type</Label>
                <Select value={form.channel_type} onValueChange={v => setForm({...form, channel_type: v})}>
                  <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 max-h-60">{CHANNEL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-zinc-400 text-xs">Display Name</Label><Input value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 text-sm mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400 text-xs">DM Policy</Label>
                <Select value={form.dm_policy} onValueChange={v => setForm({...form, dm_policy: v})}>
                  <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">{DM_POLICIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-zinc-400 text-xs">Group Policy</Label>
                <Select value={form.group_policy} onValueChange={v => setForm({...form, group_policy: v})}>
                  <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="mention">Mention</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-zinc-400 text-xs">Allow From (comma separated)</Label><Input value={(form.allow_from || []).join(', ')} onChange={e => setForm({...form, allow_from: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="+15555550123, tg:12345" /></div>
            <div className="flex items-center justify-between"><Label className="text-zinc-400 text-xs">Enabled</Label><Switch checked={form.enabled} onCheckedChange={v => setForm({...form, enabled: v})} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800/60">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-400">Cancel</Button>
            <Button data-testid="save-channel-btn" onClick={handleSave} className="bg-orange-600 hover:bg-orange-700 text-white">{editing ? 'Update' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
