import React, { useEffect, useState, useCallback } from 'react';
import { getAgents, getAgent, getModels, updateAgentMd } from '../lib/api';
import { Bot, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const EMPTY_AGENT = {
  name: '', description: '', workspace: '~/.openclaw/workspace',
  model_primary: 'anthropic/claude-sonnet-4-5', model_fallbacks: [],
  tools_profile: 'full', tools_allow: [], tools_deny: [],
  is_default: false, soul_md: '', agents_md: '', identity_md: '',
  status: 'active', heartbeat_every: '30m', heartbeat_target: 'last',
  sandbox_mode: 'off', subagents: [], group_mention_patterns: [],
};

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_AGENT);

  const load = useCallback(async () => {
    try {
      const res = await getAgents();
      setAgents(res.data);
    } catch { toast.error('Failed to load agents'); }
    finally { setLoading(false); }
    try {
      const res = await getModels();
      setAvailableModels(res.data);
    } catch { /* models list optional */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_AGENT); setDialogOpen(true); };
  const openEdit = async (agent) => {
    setEditing(agent);
    setForm({ ...EMPTY_AGENT, ...agent });
    setDialogOpen(true);
    try {
      const res = await getAgent(agent.id);
      setForm(prev => ({ ...prev, soul_md: res.data.soul_md || '', agents_md: res.data.agents_md || '', identity_md: res.data.identity_md || '' }));
    } catch { /* .md files optional */ }
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await updateAgentMd(editing.id, {
          soul_md: form.soul_md,
          agents_md: form.agents_md,
          identity_md: form.identity_md,
        });
        toast.success('Agent updated');
      }
      setDialogOpen(false);
      load();
    } catch { toast.error('Failed to save agent'); }
  };

  const handleDelete = () => {
    toast.error('Agents are managed via openclaw.json config file');
  };

  const statusBadge = (status) => {
    const cls = status === 'active'
      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
      : 'bg-zinc-800 text-zinc-500 border-zinc-700';
    return <span className={`text-xs font-mono px-2 py-0.5 rounded border uppercase tracking-wider ${cls}`}>{status}</span>;
  };

  return (
    <div data-testid="agents-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Agents</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage OpenClaw agent configurations</p>
        </div>
        <Button data-testid="create-agent-btn" onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
          <Plus className="w-4 h-4 mr-2" /> New Agent
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : agents.length === 0 ? (
        <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-12 text-center">
          <Bot className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500">No agents configured</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => (
            <div key={agent.id} data-testid={`agent-card-${agent.id}`} className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg hover:border-orange-500/20 transition-all duration-300 animate-fade-in">
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-200">{agent.name}</h3>
                      {agent.is_default && <span className="text-[10px] font-mono text-orange-500 uppercase">default</span>}
                    </div>
                  </div>
                  {statusBadge(agent.status)}
                </div>
                <p className="text-xs text-zinc-500 mb-3 line-clamp-2">{agent.description || 'No description'}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-600">Model</span>
                    <span className="font-mono text-zinc-400">{agent.model_primary}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-600">Tools</span>
                    <span className="font-mono text-zinc-400">{agent.tools_profile}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-600">Sandbox</span>
                    <span className="font-mono text-zinc-400">{agent.sandbox_mode}</span>
                  </div>
                </div>
              </div>
              <div className="border-t border-zinc-800/60 px-5 py-3 flex items-center justify-end gap-2">
                <Button data-testid={`edit-agent-${agent.id}`} variant="ghost" size="sm" onClick={() => openEdit(agent)} className="text-zinc-500 hover:text-orange-500 hover:bg-orange-500/10">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button data-testid={`delete-agent-${agent.id}`} variant="ghost" size="sm" onClick={() => handleDelete(agent.id)} className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0c0c0e] border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
              {editing ? 'Edit Agent' : 'Create Agent'}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="model">Model</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div>
                <Label className="text-zinc-400 text-xs">Name</Label>
                <Input data-testid="agent-name-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="agent-name" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Description</Label>
                <Textarea data-testid="agent-desc-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  className="bg-[#050505] border-zinc-800 focus:border-orange-500 text-sm mt-1" rows={2} placeholder="What does this agent do?" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Workspace Path</Label>
                <Input value={form.workspace} onChange={e => setForm({...form, workspace: e.target.value})}
                  className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-zinc-400 text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                  <SelectTrigger className="w-32 bg-[#050505] border-zinc-800 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-zinc-400 text-xs">Default Agent</Label>
                <Switch checked={form.is_default} onCheckedChange={v => setForm({...form, is_default: v})} />
              </div>
            </TabsContent>
            <TabsContent value="model" className="space-y-4 mt-4">
              <div>
                <Label className="text-zinc-400 text-xs">Primary Model</Label>
                <Select value={form.model_primary} onValueChange={v => setForm({...form, model_primary: v})}>
                  <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1 font-mono"><SelectValue placeholder="Select a model" /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 max-h-60">
                    {availableModels.map(m => (
                      <SelectItem key={m.key} value={m.key} className="font-mono text-sm">
                        {m.name} <span className="text-zinc-500 ml-1">({m.key})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs mb-2 block">Fallback Models</Label>
                <div className="bg-[#050505] border border-zinc-800 rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
                  {availableModels.length === 0 && <p className="text-xs text-zinc-600 px-2 py-1">No models available</p>}
                  {availableModels.filter(m => m.key !== form.model_primary).map(m => {
                    const checked = (form.model_fallbacks || []).includes(m.key);
                    return (
                      <label key={m.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/50 cursor-pointer text-sm">
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            const fallbacks = form.model_fallbacks || [];
                            setForm({...form, model_fallbacks: checked ? fallbacks.filter(k => k !== m.key) : [...fallbacks, m.key]});
                          }}
                          className="rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500/30" />
                        <span className="font-mono text-zinc-300">{m.name}</span>
                        <span className="font-mono text-zinc-600 text-xs ml-auto">{m.key}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="tools" className="space-y-4 mt-4">
              <div>
                <Label className="text-zinc-400 text-xs">Tools Profile</Label>
                <Select value={form.tools_profile} onValueChange={v => setForm({...form, tools_profile: v})}>
                  <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="full">Full</SelectItem>
                    <SelectItem value="coding">Coding</SelectItem>
                    <SelectItem value="messaging">Messaging</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Allow Tools (comma separated)</Label>
                <Input value={(form.tools_allow || []).join(', ')} onChange={e => setForm({...form, tools_allow: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                  className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="group:fs, browser" />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Deny Tools (comma separated)</Label>
                <Input value={(form.tools_deny || []).join(', ')} onChange={e => setForm({...form, tools_deny: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                  className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="exec, process" />
              </div>
            </TabsContent>
            <TabsContent value="advanced" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-400 text-xs">Heartbeat Interval</Label>
                  <Input value={form.heartbeat_every} onChange={e => setForm({...form, heartbeat_every: e.target.value})}
                    className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="30m" />
                </div>
                <div>
                  <Label className="text-zinc-400 text-xs">Heartbeat Target</Label>
                  <Select value={form.heartbeat_target} onValueChange={v => setForm({...form, heartbeat_target: v})}>
                    <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="last">Last</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="telegram">Telegram</SelectItem>
                      <SelectItem value="discord">Discord</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Sandbox Mode</Label>
                <Select value={form.sandbox_mode} onValueChange={v => setForm({...form, sandbox_mode: v})}>
                  <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="off">Off</SelectItem>
                    <SelectItem value="non-main">Non-main</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">IDENTITY.md</Label>
                <Textarea value={form.identity_md} onChange={e => setForm({...form, identity_md: e.target.value})}
                  className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" rows={4} placeholder="Identity, name, persona..." />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">SOUL.md</Label>
                <Textarea value={form.soul_md} onChange={e => setForm({...form, soul_md: e.target.value})}
                  className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" rows={4} placeholder="Persona, boundaries, tone..." />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">AGENTS.md</Label>
                <Textarea value={form.agents_md} onChange={e => setForm({...form, agents_md: e.target.value})}
                  className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" rows={4} placeholder="Operating instructions..." />
              </div>
              <div>
                <Label className="text-zinc-400 text-xs">Mention Patterns (comma separated)</Label>
                <Input value={(form.group_mention_patterns || []).join(', ')} onChange={e => setForm({...form, group_mention_patterns: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                  className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="@openclaw, openclaw" />
              </div>
            </TabsContent>
          </Tabs>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800/60">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">Cancel</Button>
            <Button data-testid="save-agent-btn" onClick={handleSave} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
