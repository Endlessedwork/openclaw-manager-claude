import React, { useEffect, useState } from 'react';
import { getModels, createModel, updateModel, deleteModel } from '../lib/api';
import { Cpu, Plus, Pencil, Trash2, Star, StarOff } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';

const EMPTY_PROVIDER = {
  provider_name: '', display_name: '', api_key: '', base_url: '',
  models: [], enabled: true, is_primary: false, settings: {},
};

export default function ModelsPage() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PROVIDER);
  const [modelsText, setModelsText] = useState('');

  const load = async () => {
    try { const res = await getModels(); setProviders(res.data); }
    catch { toast.error('Failed to load models'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_PROVIDER); setModelsText(''); setDialogOpen(true); };
  const openEdit = (p) => {
    setEditing(p); setForm(p);
    setModelsText((p.models || []).map(m => `${m.id}:${m.alias || m.id}`).join('\n'));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const models = modelsText.split('\n').filter(Boolean).map(line => {
        const [id, alias] = line.split(':');
        return { id: id?.trim(), alias: (alias || id)?.trim() };
      });
      const payload = { ...form, models };
      if (editing) { await updateModel(editing.id, payload); toast.success('Provider updated'); }
      else { await createModel(payload); toast.success('Provider created'); }
      setDialogOpen(false); load();
    } catch { toast.error('Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this provider?')) return;
    try { await deleteModel(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const handleToggle = async (p) => {
    try { await updateModel(p.id, { ...p, enabled: !p.enabled }); load(); }
    catch { toast.error('Failed'); }
  };

  return (
    <div data-testid="models-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Model Providers</h1>
          <p className="text-sm text-zinc-500 mt-1">Configure LLM providers and model catalog</p>
        </div>
        <Button data-testid="create-model-btn" onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
          <Plus className="w-4 h-4 mr-2" /> Add Provider
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map(p => (
            <div key={p.id} data-testid={`provider-card-${p.id}`} className={`bg-[#0c0c0e] border rounded-lg hover:border-orange-500/20 transition-all duration-300 ${p.is_primary ? 'border-orange-500/30' : 'border-zinc-800/60'}`}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${p.enabled ? 'bg-sky-500/10 border-sky-500/20' : 'bg-zinc-800 border-zinc-700'}`}>
                      <Cpu className={`w-4 h-4 ${p.enabled ? 'text-sky-500' : 'text-zinc-600'}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-200">{p.display_name || p.provider_name}</h3>
                      <span className="text-[10px] font-mono text-zinc-500">{p.provider_name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.is_primary && <Star className="w-4 h-4 text-orange-500 fill-orange-500" />}
                    <Switch checked={p.enabled} onCheckedChange={() => handleToggle(p)} />
                  </div>
                </div>
                {p.models?.length > 0 && (
                  <div className="space-y-1">
                    {p.models.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-zinc-400">{m.id}</span>
                        <span className="text-zinc-600">{m.alias}</span>
                      </div>
                    ))}
                  </div>
                )}
                {p.api_key && (
                  <div className="mt-3 text-[10px] font-mono text-zinc-600">
                    Key: {'*'.repeat(8)}...{p.api_key.slice(-4)}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#0c0c0e] border-zinc-800 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>{editing ? 'Edit Provider' : 'Add Provider'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-zinc-400 text-xs">Provider ID</Label><Input data-testid="provider-name-input" value={form.provider_name} onChange={e => setForm({...form, provider_name: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="anthropic" /></div>
              <div><Label className="text-zinc-400 text-xs">Display Name</Label><Input value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 text-sm mt-1" placeholder="Anthropic" /></div>
            </div>
            <div><Label className="text-zinc-400 text-xs">API Key</Label><Input type="password" value={form.api_key} onChange={e => setForm({...form, api_key: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Base URL (optional)</Label><Input value={form.base_url} onChange={e => setForm({...form, base_url: e.target.value})} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" placeholder="https://api.example.com" /></div>
            <div><Label className="text-zinc-400 text-xs">Models (one per line: id:alias)</Label><Textarea value={modelsText} onChange={e => setModelsText(e.target.value)} className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm mt-1" rows={4} placeholder="claude-sonnet-4-5:Sonnet" /></div>
            <div className="flex items-center justify-between"><Label className="text-zinc-400 text-xs">Primary Provider</Label><Switch checked={form.is_primary} onCheckedChange={v => setForm({...form, is_primary: v})} /></div>
            <div className="flex items-center justify-between"><Label className="text-zinc-400 text-xs">Enabled</Label><Switch checked={form.enabled} onCheckedChange={v => setForm({...form, enabled: v})} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800/60">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-400">Cancel</Button>
            <Button data-testid="save-model-btn" onClick={handleSave} className="bg-orange-600 hover:bg-orange-700 text-white">{editing ? 'Update' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
