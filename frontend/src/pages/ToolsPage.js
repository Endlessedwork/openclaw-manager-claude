import React, { useEffect, useState } from 'react';
import { getTools } from '../lib/api';
import { Wrench, Plus, Pencil, Trash2, Search, Shield, ShieldOff } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';

const CATEGORIES = ['core', 'runtime', 'fs', 'web', 'ui', 'messaging', 'automation', 'sessions', 'nodes'];
const TOOL_GROUPS = ['group:runtime', 'group:fs', 'group:sessions', 'group:memory', 'group:web', 'group:ui', 'group:automation', 'group:messaging', 'group:nodes', 'group:openclaw'];

export default function ToolsPage() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ tool_name: '', description: '', category: 'core', enabled: true, agent_id: '', profile: 'full', allow: [], deny: [], settings: {} });

  const load = async () => {
    try { const res = await getTools(); setTools(res.data); }
    catch { toast.error('Failed to load tools'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = tools.filter(t => {
    const matchSearch = (t.tool_name || '').toLowerCase().includes(search.toLowerCase()) || (t.description || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'all' || t.category === filterCat;
    return matchSearch && matchCat;
  });

  const grouped = filtered.reduce((acc, t) => { (acc[t.category] = acc[t.category] || []).push(t); return acc; }, {});

  const handleToggle = async (tool) => {
    try {
      await updateTool(tool.id, { ...tool, enabled: !tool.enabled });
      toast.success(`Tool ${tool.enabled ? 'disabled' : 'enabled'}`); load();
    } catch { toast.error('Failed to toggle'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this tool config?')) return;
    try { await deleteTool(id); toast.success('Tool deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const catColor = (cat) => {
    const colors = { core: 'text-orange-500 bg-orange-500/10', runtime: 'text-red-500 bg-red-500/10', fs: 'text-emerald-500 bg-emerald-500/10', web: 'text-sky-500 bg-sky-500/10', ui: 'text-violet-500 bg-violet-500/10', messaging: 'text-blue-500 bg-blue-500/10', automation: 'text-amber-500 bg-amber-500/10', sessions: 'text-teal-500 bg-teal-500/10', nodes: 'text-pink-500 bg-pink-500/10' };
    return colors[cat] || 'text-zinc-500 bg-zinc-800';
  };

  return (
    <div data-testid="tools-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Tools</h1>
          <p className="text-sm text-zinc-500 mt-1">Configure tool policies and profiles</p>
        </div>
        <Button data-testid="create-tool-btn" onClick={() => { setEditing(null); setForm({ tool_name: '', description: '', category: 'core', enabled: true, agent_id: '', profile: 'full', allow: [], deny: [], settings: {} }); setDialogOpen(true); }} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
          <Plus className="w-4 h-4 mr-2" /> Add Tool
        </Button>
      </div>

      {/* Tool Groups Reference */}
      <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-4">
        <h3 className="text-xs font-mono text-zinc-500 mb-2 uppercase tracking-wider">Tool Groups</h3>
        <div className="flex flex-wrap gap-2">
          {TOOL_GROUPS.map(g => (
            <span key={g} className="text-xs font-mono px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">{g}</span>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <Input data-testid="tool-search" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm" placeholder="Search tools..." />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-40 bg-[#050505] border-zinc-800 text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-12 text-center">
          <Wrench className="w-12 h-12 text-zinc-700 mx-auto mb-3" /><p className="text-zinc-500">No tools found</p>
        </div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="space-y-2">
            <h3 className={`text-xs font-mono uppercase tracking-wider px-1 ${catColor(cat).split(' ')[0]}`}>{cat}</h3>
            <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg divide-y divide-zinc-800/40">
              {items.map(tool => (
                <div key={tool.id} data-testid={`tool-row-${tool.id}`} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-7 h-7 rounded flex items-center justify-center ${catColor(tool.category)}`}>
                      <Wrench className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-mono text-zinc-200">{tool.tool_name}</h4>
                      <p className="text-xs text-zinc-500 truncate">{tool.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Switch checked={tool.enabled} onCheckedChange={() => handleToggle(tool)} />
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(tool.id)} className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0c0c0e] border-zinc-800 max-w-md">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>Add Tool Config</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label className="text-zinc-400 text-xs">Tool Name</Label><Input value={form.tool_name} onChange={e => setForm({...form, tool_name: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Description</Label><Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 text-sm mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800/60">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-400">Cancel</Button>
            <Button data-testid="save-tool-btn" onClick={async () => { try { await createTool(form); toast.success('Tool added'); setDialogOpen(false); load(); } catch { toast.error('Failed'); } }} className="bg-orange-600 hover:bg-orange-700 text-white">Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
