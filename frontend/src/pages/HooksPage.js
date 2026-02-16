import React, { useEffect, useState } from 'react';
import { getHooksConfig, updateHooksConfig, getHookMappings, createHookMapping, updateHookMapping, deleteHookMapping } from '../lib/api';
import { Webhook, Plus, Pencil, Trash2, Settings, Zap, Eye, EyeOff } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';

const EMPTY_MAPPING = {
  name: '', path: '', action: 'agent', agent_id: 'main',
  session_key: '', message_template: '', wake_mode: 'now',
  deliver: false, channel: 'last', model: '', enabled: true,
};

export default function HooksPage() {
  const [config, setConfig] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_MAPPING);
  const [showToken, setShowToken] = useState(false);

  const load = async () => {
    try {
      const [cRes, mRes] = await Promise.all([getHooksConfig(), getHookMappings()]);
      setConfig(cRes.data);
      setMappings(mRes.data);
    } catch { toast.error('Failed to load hooks'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_MAPPING); setDialogOpen(true); };
  const openEdit = (m) => { setEditing(m); setForm(m); setDialogOpen(true); };

  const handleSave = async () => {
    try {
      if (editing) { await updateHookMapping(editing.id, form); toast.success('Hook updated'); }
      else { await createHookMapping(form); toast.success('Hook created'); }
      setDialogOpen(false); load();
    } catch { toast.error('Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this hook mapping?')) return;
    try { await deleteHookMapping(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed'); }
  };

  const handleToggle = async (m) => {
    try {
      await updateHookMapping(m.id, { ...m, enabled: !m.enabled });
      toast.success(`Hook ${m.enabled ? 'disabled' : 'enabled'}`); load();
    } catch { toast.error('Failed'); }
  };

  const handleConfigSave = async () => {
    try {
      await updateHooksConfig(config);
      toast.success('Hooks config saved');
      setConfigOpen(false); load();
    } catch { toast.error('Failed to save config'); }
  };

  return (
    <div data-testid="hooks-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Hooks</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage webhook endpoints and hook mappings</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setConfigOpen(true)} className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
            <Settings className="w-4 h-4 mr-2" /> Config
          </Button>
          <Button data-testid="create-hook-btn" onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
            <Plus className="w-4 h-4 mr-2" /> New Hook
          </Button>
        </div>
      </div>

      {/* Hooks Config Summary */}
      {config && (
        <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-5">
          <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">Hook Configuration</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-zinc-600">Status</span>
              <p className={`font-mono mt-0.5 ${config.enabled ? 'text-emerald-500' : 'text-red-500'}`}>{config.enabled ? 'ENABLED' : 'DISABLED'}</p>
            </div>
            <div>
              <span className="text-zinc-600">Path</span>
              <p className="font-mono text-zinc-300 mt-0.5">{config.path}</p>
            </div>
            <div>
              <span className="text-zinc-600">Token</span>
              <p className="font-mono text-zinc-300 mt-0.5">{config.token ? '***' + config.token.slice(-4) : 'Not set'}</p>
            </div>
            <div>
              <span className="text-zinc-600">Presets</span>
              <p className="font-mono text-zinc-300 mt-0.5">{config.presets?.join(', ') || 'None'}</p>
            </div>
          </div>
          <div className="mt-3 text-[10px] font-mono text-zinc-600">
            Endpoints: POST {config.path}/wake | POST {config.path}/agent | POST {config.path}/&lt;name&gt;
          </div>
        </div>
      )}

      {/* Hook Mappings */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : mappings.length === 0 ? (
        <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-12 text-center">
          <Webhook className="w-12 h-12 text-zinc-700 mx-auto mb-3" /><p className="text-zinc-500">No hook mappings configured</p>
        </div>
      ) : (
        <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg divide-y divide-zinc-800/40">
          {mappings.map(m => (
            <div key={m.id} data-testid={`hook-row-${m.id}`} className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${m.enabled ? 'bg-orange-500/10 border-orange-500/20' : 'bg-zinc-800 border-zinc-700'}`}>
                    <Webhook className={`w-4 h-4 ${m.enabled ? 'text-orange-500' : 'text-zinc-600'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-zinc-200">{m.name}</h3>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400">/{m.path}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                        m.action === 'agent' ? 'text-sky-500 bg-sky-500/10 border-sky-500/20' :
                        m.action === 'wake' ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' :
                        'text-zinc-500 bg-zinc-800 border-zinc-700'
                      }`}>{m.action}</span>
                    </div>
                    <div className="flex gap-4 mt-1 text-[10px] font-mono text-zinc-600">
                      <span>Agent: {m.agent_id}</span>
                      <span>Wake: {m.wake_mode}</span>
                      {m.deliver && <span className="text-sky-500">Deliver: {m.channel}</span>}
                      {m.model && <span>Model: {m.model}</span>}
                    </div>
                    {m.message_template && (
                      <p className="text-[10px] font-mono text-zinc-700 mt-1 truncate">Template: {m.message_template}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Switch checked={m.enabled} onCheckedChange={() => handleToggle(m)} />
                  <Button variant="ghost" size="sm" onClick={() => openEdit(m)} className="text-zinc-500 hover:text-orange-500 hover:bg-orange-500/10"><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(m.id)} className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Hook Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0c0c0e] border-zinc-800 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>{editing ? 'Edit Hook' : 'New Hook'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400 text-xs">Name</Label><Input data-testid="hook-name-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 text-sm mt-1" /></div>
              <div><Label className="text-zinc-400 text-xs">Path</Label><Input value={form.path} onChange={e => setForm({...form, path: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="gmail" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400 text-xs">Action</Label>
                <Select value={form.action} onValueChange={v => setForm({...form, action: v})}>
                  <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="wake">Wake</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-zinc-400 text-xs">Agent ID</Label><Input value={form.agent_id} onChange={e => setForm({...form, agent_id: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" /></div>
            </div>
            <div><Label className="text-zinc-400 text-xs">Session Key</Label><Input value={form.session_key} onChange={e => setForm({...form, session_key: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="hook:gmail:{{messages[0].id}}" /></div>
            <div><Label className="text-zinc-400 text-xs">Message Template</Label><Textarea value={form.message_template} onChange={e => setForm({...form, message_template: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" rows={3} placeholder="From: {{messages[0].from}}" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400 text-xs">Wake Mode</Label>
                <Select value={form.wake_mode} onValueChange={v => setForm({...form, wake_mode: v})}>
                  <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="now">Now</SelectItem>
                    <SelectItem value="next-heartbeat">Next Heartbeat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-zinc-400 text-xs">Channel</Label><Input value={form.channel} onChange={e => setForm({...form, channel: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="last" /></div>
            </div>
            <div><Label className="text-zinc-400 text-xs">Model (optional)</Label><Input value={form.model} onChange={e => setForm({...form, model: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="openai/gpt-5.2-mini" /></div>
            <div className="flex items-center justify-between"><Label className="text-zinc-400 text-xs">Deliver to Channel</Label><Switch checked={form.deliver} onCheckedChange={v => setForm({...form, deliver: v})} /></div>
            <div className="flex items-center justify-between"><Label className="text-zinc-400 text-xs">Enabled</Label><Switch checked={form.enabled} onCheckedChange={v => setForm({...form, enabled: v})} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800/60">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-400">Cancel</Button>
            <Button data-testid="save-hook-btn" onClick={handleSave} className="bg-orange-600 hover:bg-orange-700 text-white">{editing ? 'Update' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hooks Config Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="bg-[#0c0c0e] border-zinc-800 max-w-md">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>Hooks Configuration</DialogTitle></DialogHeader>
          {config && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center justify-between"><Label className="text-zinc-400 text-xs">Hooks Enabled</Label><Switch checked={config.enabled} onCheckedChange={v => setConfig({...config, enabled: v})} /></div>
              <div><Label className="text-zinc-400 text-xs">Auth Token</Label>
                <div className="relative">
                  <Input type={showToken ? 'text' : 'password'} value={config.token} onChange={e => setConfig({...config, token: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1 pr-10" />
                  <button onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 text-zinc-600 hover:text-zinc-400">
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div><Label className="text-zinc-400 text-xs">Path</Label><Input value={config.path} onChange={e => setConfig({...config, path: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" /></div>
              <div><Label className="text-zinc-400 text-xs">Default Session Key</Label><Input value={config.default_session_key} onChange={e => setConfig({...config, default_session_key: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" /></div>
              <div><Label className="text-zinc-400 text-xs">Max Body Bytes</Label><Input type="number" value={config.max_body_bytes} onChange={e => setConfig({...config, max_body_bytes: parseInt(e.target.value) || 262144})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" /></div>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800/60">
            <Button variant="outline" onClick={() => setConfigOpen(false)} className="border-zinc-700 text-zinc-400">Cancel</Button>
            <Button onClick={handleConfigSave} className="bg-orange-600 hover:bg-orange-700 text-white">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
