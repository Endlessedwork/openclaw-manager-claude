import React, { useEffect, useState, useCallback } from 'react';
import { getModels, getProviders, createProvider, updateProvider, deleteProvider } from '../lib/api';
import { Cpu, Plus, Pencil, Trash2, Star, AlertTriangle, CheckCircle2, Server } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';

const EMPTY_PROVIDER = { id: '', base_url: '', api: 'openai-completions', models: [] };

export default function ModelsPage() {
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PROVIDER);
  const [modelsText, setModelsText] = useState('');

  const load = useCallback(async () => {
    try {
      const [mRes, pRes] = await Promise.all([getModels(), getProviders()]);
      setModels(mRes.data);
      setProviders(pRes.data);
    } catch { toast.error('Failed to load models'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_PROVIDER); setModelsText(''); setDialogOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({ id: p.id, base_url: p.base_url, api: p.api });
    setModelsText(
      (p.models || []).map(m => {
        const parts = [m.id];
        if (m.name) parts.push(m.name);
        if (m.contextWindow) parts.push(m.contextWindow);
        return parts.join(':');
      }).join('\n')
    );
    setDialogOpen(true);
  };

  const parseModels = (text) =>
    text.split('\n').filter(Boolean).map(line => {
      const [id, name, ctx] = line.split(':').map(s => s?.trim());
      const m = { id };
      if (name) m.name = name;
      if (ctx && !isNaN(Number(ctx))) m.contextWindow = Number(ctx);
      return m;
    });

  const handleSave = async () => {
    try {
      const payload = { ...form, models: parseModels(modelsText) };
      if (editing) {
        await updateProvider(editing.id, payload);
        toast.success('Provider updated — gateway reloading');
      } else {
        await createProvider(payload);
        toast.success('Provider created — gateway reloading');
      }
      setDialogOpen(false);
      setTimeout(load, 2000);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Delete provider "${id}"? This will reload the gateway.`)) return;
    try {
      await deleteProvider(id);
      toast.success('Provider deleted');
      setTimeout(load, 2000);
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div data-testid="models-page" className="space-y-8">
      {/* === Active Models from CLI === */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Models</h1>
        <p className="text-sm text-zinc-500 mt-1">Active models from gateway (config + environment)</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {models.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">No models available</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {models.map(m => (
                <div key={m.id} className={`bg-[#0c0c0e] border rounded-lg hover:border-orange-500/20 transition-all duration-300 ${m.is_primary ? 'border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.08)]' : 'border-zinc-800/60'}`}>
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${m.enabled ? 'bg-sky-500/10 border-sky-500/20' : 'bg-zinc-800 border-zinc-700'}`}>
                          <Cpu className={`w-4 h-4 ${m.enabled ? 'text-sky-500' : 'text-zinc-600'}`} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-zinc-200 truncate">{m.name}</h3>
                          <span className="text-[10px] font-mono text-zinc-500">{m.key}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.is_primary && <Star className="w-4 h-4 text-orange-500 fill-orange-500" title="Default model" />}
                        {m.enabled ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" title="Available" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500" title="Unavailable" />
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 mt-3">
                      {m.provider_id && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">Provider</span>
                          <span className="font-mono text-zinc-300">{m.provider_id}</span>
                        </div>
                      )}
                      {m.input && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">Input</span>
                          <span className="font-mono text-zinc-300">{m.input}</span>
                        </div>
                      )}
                      {m.context_window && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">Context</span>
                          <span className="font-mono text-zinc-300">{Number(m.context_window).toLocaleString()} tokens</span>
                        </div>
                      )}
                    </div>
                    {m.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {m.tags.map(tag => (
                          <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${tag === 'default' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* === Config Providers (CRUD) === */}
          <div className="pt-4 border-t border-zinc-800/40">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Config Providers</h2>
                <p className="text-sm text-zinc-500 mt-1">Manage providers in openclaw.json — changes reload the gateway</p>
              </div>
              <Button data-testid="create-provider-btn" onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                <Plus className="w-4 h-4 mr-2" /> Add Provider
              </Button>
            </div>

            {providers.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">No custom providers in config</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {providers.map(p => (
                  <div key={p.id} className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg hover:border-orange-500/20 transition-all duration-300">
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-violet-500/10 border-violet-500/20">
                            <Server className="w-4 h-4 text-violet-500" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-zinc-200">{p.id}</h3>
                            <span className="text-[10px] font-mono text-zinc-500">{p.api}</span>
                          </div>
                        </div>
                      </div>
                      {p.base_url && (
                        <div className="text-[10px] font-mono text-zinc-500 truncate mb-2">{p.base_url}</div>
                      )}
                      {p.models?.length > 0 && (
                        <div className="space-y-1">
                          {p.models.map((m, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="font-mono text-zinc-400">{m.id}</span>
                              {m.name && <span className="text-zinc-600">{m.name}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="border-t border-zinc-800/60 px-5 py-3 flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="text-zinc-500 hover:text-orange-500 hover:bg-orange-500/10">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* === Provider Dialog === */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0c0c0e] border-zinc-800 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
              {editing ? `Edit Provider: ${editing.id}` : 'Add Provider'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {!editing && (
              <div>
                <Label className="text-zinc-400 text-xs">Provider ID</Label>
                <Input data-testid="provider-id-input" value={form.id} onChange={e => setForm({...form, id: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="anthropic" />
              </div>
            )}
            <div>
              <Label className="text-zinc-400 text-xs">Base URL</Label>
              <Input value={form.base_url} onChange={e => setForm({...form, base_url: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="https://api.example.com/v1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">API Type</Label>
              <Input value={form.api} onChange={e => setForm({...form, api: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="openai-completions" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Models (one per line: id:name:contextWindow)</Label>
              <Textarea value={modelsText} onChange={e => setModelsText(e.target.value)} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" rows={4} placeholder={"kimi-k2.5:Kimi K2.5:256000\ngpt-4o:GPT-4o:128000"} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800/60">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-400">Cancel</Button>
            <Button data-testid="save-provider-btn" onClick={handleSave} className="bg-orange-600 hover:bg-orange-700 text-white">
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
