import React, { useEffect, useState, useCallback } from 'react';
import { getProviders, createProvider, updateProvider, deleteProvider, testProviderConnection } from '../lib/api';
import { Server, Plus, Pencil, Trash2, X, Wifi, WifiOff, Loader2, Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const EMPTY_PROVIDER = { id: '', base_url: '', api: 'openai-completions' };
const EMPTY_MODEL_ROW = { id: '', name: '', contextWindow: '' };

const API_TYPES = [
  { value: 'openai-completions', label: 'OpenAI Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google Gemini' },
];

const PROVIDER_COLORS = {
  openai: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-500' },
  anthropic: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' },
  google: { bg: 'bg-sky-500/10', border: 'border-sky-500/20', text: 'text-sky-500' },
  openrouter: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' },
  zai: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
};
const DEFAULT_COLOR = { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-500' };

function getColor(pid) {
  return PROVIDER_COLORS[pid] || DEFAULT_COLOR;
}

export default function ProvidersPage() {
  const { canEdit } = useAuth();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PROVIDER);
  const [modelRows, setModelRows] = useState([{ ...EMPTY_MODEL_ROW }]);
  const [testing, setTesting] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await getProviders();
      setProviders(res.data);
    } catch { toast.error('Failed to load providers'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_PROVIDER);
    setModelRows([{ ...EMPTY_MODEL_ROW }]);
    setDialogOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({ id: p.id, base_url: p.base_url, api: p.api });
    const rows = (p.models || []).map(m => ({
      id: m.id || '',
      name: m.name || '',
      contextWindow: m.contextWindow ? String(m.contextWindow) : '',
    }));
    setModelRows(rows.length > 0 ? rows : [{ ...EMPTY_MODEL_ROW }]);
    setDialogOpen(true);
  };

  const updateModelRow = (index, field, value) => {
    setModelRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  };
  const addModelRow = () => setModelRows(prev => [...prev, { ...EMPTY_MODEL_ROW }]);
  const removeModelRow = (index) => {
    setModelRows(prev => prev.length <= 1 ? [{ ...EMPTY_MODEL_ROW }] : prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      const parsedModels = modelRows.filter(r => r.id.trim()).map(r => {
        const m = { id: r.id.trim() };
        if (r.name.trim()) m.name = r.name.trim();
        if (r.contextWindow && !isNaN(Number(r.contextWindow))) m.contextWindow = Number(r.contextWindow);
        return m;
      });
      const payload = { ...form, models: parsedModels };
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

  const handleTest = async (id) => {
    setTesting(prev => ({ ...prev, [id]: 'loading' }));
    try {
      const res = await testProviderConnection(id);
      const data = res.data;
      if (data.ok) {
        setTesting(prev => ({ ...prev, [id]: 'ok' }));
        toast.success(`${id}: Reachable (${data.latency_ms}ms)${data.note ? ` — ${data.note}` : ''}`);
      } else {
        setTesting(prev => ({ ...prev, [id]: 'error' }));
        toast.error(`${id}: ${data.error}`);
      }
    } catch {
      setTesting(prev => ({ ...prev, [id]: 'error' }));
      toast.error(`Failed to test ${id}`);
    }
    setTimeout(() => setTesting(prev => ({ ...prev, [id]: null })), 5000);
  };

  const customProviders = providers.filter(p => p.source === 'custom');
  const builtinProviders = providers.filter(p => p.source === 'builtin');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Providers</h1>
          <p className="text-sm text-theme-faint mt-1">All LLM providers powering the gateway — custom and built-in</p>
        </div>
        {canEdit() && (
          <Button onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
            <Plus className="w-4 h-4 mr-2" /> Add Provider
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Custom Providers */}
          {customProviders.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-theme-secondary mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Custom Providers
                <span className="text-xs font-normal text-theme-dimmed ml-2">from openclaw.json</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {customProviders.map(p => {
                  const color = getColor(p.id);
                  return (
                    <div key={p.id} className="bg-surface-card border border-subtle rounded-lg hover:border-orange-500/20 transition-all duration-300 flex flex-col">
                      <div className="p-5 flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${color.bg} ${color.border} shrink-0`}>
                              <Server className={`w-4 h-4 ${color.text}`} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-theme-primary truncate">{p.id}</h3>
                              <span className="text-[10px] font-mono text-theme-faint">{API_TYPES.find(t => t.value === p.api)?.label || p.api}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {testing[p.id] === 'ok' && <Wifi className="w-4 h-4 text-emerald-500" />}
                            {testing[p.id] === 'error' && <WifiOff className="w-4 h-4 text-red-500" />}
                            {testing[p.id] === 'loading' && <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />}
                          </div>
                        </div>

                        {p.base_url && (
                          <div className="text-[10px] font-mono text-theme-faint truncate mb-3 px-2 py-1.5 bg-surface-sunken rounded border border-subtle">
                            {p.base_url}
                          </div>
                        )}

                        {p.models?.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase tracking-wider text-theme-dimmed font-medium">
                              {p.active_count}/{p.total_count} model{p.total_count !== 1 ? 's' : ''} active
                            </span>
                            {p.models.map((m, i) => (
                              <div key={i} className="flex items-center justify-between text-xs py-0.5">
                                <div className="flex items-center gap-1.5">
                                  {m.enabled
                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                    : <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                  }
                                  <span className="font-mono text-theme-muted">{m.id}</span>
                                </div>
                                {m.name && <span className="text-theme-dimmed text-[10px]">{m.name}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {canEdit() && (
                        <div className="border-t border-subtle px-5 py-3 flex items-center justify-between">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleTest(p.id)}
                            disabled={testing[p.id] === 'loading' || !p.base_url}
                            className="text-theme-faint hover:text-sky-400 hover:bg-sky-500/10 h-7 px-2 text-xs gap-1.5"
                          >
                            {testing[p.id] === 'loading'
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Wifi className="w-3.5 h-3.5" />
                            }
                            Test
                          </Button>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="text-theme-faint hover:text-orange-500 hover:bg-orange-500/10 h-7 w-7 p-0">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} className="text-theme-faint hover:text-red-500 hover:bg-red-500/10 h-7 w-7 p-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Built-in Providers */}
          {builtinProviders.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-theme-secondary mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Built-in Providers
                <span className="text-xs font-normal text-theme-dimmed ml-2">from environment &amp; gateway defaults</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {builtinProviders.map(p => {
                  const color = getColor(p.id);
                  return (
                    <div key={p.id} className="bg-surface-card border border-subtle rounded-lg hover:border-strong/60 transition-all duration-300 flex flex-col">
                      <div className="p-5 flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${color.bg} ${color.border} shrink-0`}>
                              <Server className={`w-4 h-4 ${color.text}`} />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-theme-primary truncate">{p.id}</h3>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Lock className="w-2.5 h-2.5 text-theme-dimmed" />
                                <span className="text-[10px] text-theme-dimmed">Built-in</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] font-mono text-theme-faint">
                              {p.active_count}/{p.total_count}
                            </span>
                          </div>
                        </div>

                        {p.models?.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase tracking-wider text-theme-dimmed font-medium">
                              {p.active_count} of {p.total_count} model{p.total_count !== 1 ? 's' : ''} active
                            </span>
                            {p.models.map((m, i) => (
                              <div key={i} className="flex items-center justify-between text-xs py-0.5">
                                <div className="flex items-center gap-1.5">
                                  {m.enabled
                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                    : <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                  }
                                  <span className="font-mono text-theme-muted">{m.id}</span>
                                </div>
                                {m.name && <span className="text-theme-dimmed text-[10px] truncate ml-2">{m.name}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state (no providers at all) */}
          {providers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-theme-faint">
              <Server className="w-10 h-10 mb-3 text-theme-dimmed" />
              <p className="text-sm">No providers found</p>
            </div>
          )}
        </>
      )}

      {/* Provider Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
              {editing ? `Edit Provider: ${editing.id}` : 'Add Provider'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {!editing && (
              <div>
                <Label className="text-theme-muted text-xs">Provider ID</Label>
                <Input value={form.id} onChange={e => setForm({...form, id: e.target.value})} className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" placeholder="anthropic" />
              </div>
            )}
            <div>
              <Label className="text-theme-muted text-xs">Base URL</Label>
              <Input value={form.base_url} onChange={e => setForm({...form, base_url: e.target.value})} className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" placeholder="https://api.example.com/v1" />
            </div>
            <div>
              <Label className="text-theme-muted text-xs">API Type</Label>
              <Select value={form.api} onValueChange={v => setForm({...form, api: v})}>
                <SelectTrigger className="bg-surface-sunken border-subtle text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle">
                  {API_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-theme-muted text-xs">Models</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addModelRow} className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 h-6 px-2 text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Add Model
                </Button>
              </div>
              <div className="space-y-2">
                {modelRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={row.id} onChange={e => updateModelRow(i, 'id', e.target.value)}
                      className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm flex-[2]" placeholder="model-id" />
                    <Input value={row.name} onChange={e => updateModelRow(i, 'name', e.target.value)}
                      className="bg-surface-sunken border-subtle focus:border-orange-500 text-sm flex-[2]" placeholder="Display Name" />
                    <Input value={row.contextWindow} onChange={e => updateModelRow(i, 'contextWindow', e.target.value)}
                      className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm flex-1" placeholder="Context" type="number" />
                    <button type="button" onClick={() => removeModelRow(i)} className="p-1 text-theme-dimmed hover:text-red-400 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-theme-dimmed mt-1">Model ID is required. Display name and context window are optional.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-subtle">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-strong text-theme-muted">Cancel</Button>
            <Button onClick={handleSave} className="bg-orange-600 hover:bg-orange-700 text-white">
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
