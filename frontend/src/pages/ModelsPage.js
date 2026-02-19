import React, { useEffect, useState, useCallback } from 'react';
import { getModels, getProviders, createProvider, updateProvider, deleteProvider, getFallbacks, updateFallbacks, updateAgentFallbacks } from '../lib/api';
import { Cpu, Plus, Pencil, Trash2, Star, AlertTriangle, CheckCircle2, Server, X, Save, Image, LayoutGrid, List } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import SortableFallbackList from '../components/SortableFallbackList';

const EMPTY_PROVIDER = { id: '', base_url: '', api: 'openai-completions' };
const EMPTY_MODEL_ROW = { id: '', name: '', contextWindow: '' };

const API_TYPES = [
  { value: 'openai-completions', label: 'OpenAI Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google Gemini' },
];

export default function ModelsPage() {
  const { canEdit } = useAuth();
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PROVIDER);
  const [modelRows, setModelRows] = useState([{ ...EMPTY_MODEL_ROW }]);
  const [fallbackConfig, setFallbackConfig] = useState(null);
  const [editModel, setEditModel] = useState({ primary: '', fallbacks: [] });
  const [editImage, setEditImage] = useState({ primary: '', fallbacks: [] });
  const [editAgents, setEditAgents] = useState([]);
  const [fallbackDirty, setFallbackDirty] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [agentForm, setAgentForm] = useState({ model: '', fallbacks: [] });
  const [viewMode, setViewMode] = useState('grid');

  const load = useCallback(async () => {
    try {
      const [mRes, pRes, fRes] = await Promise.all([getModels(), getProviders(), getFallbacks()]);
      setModels(mRes.data);
      setProviders(pRes.data);
      const fb = fRes.data;
      setFallbackConfig(fb);
      setEditModel(fb.model);
      setEditImage(fb.imageModel);
      setEditAgents(fb.agents);
      setFallbackDirty(false);
    } catch { toast.error('Failed to load models'); }
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

  const handleFallbackSave = async () => {
    try {
      await updateFallbacks({ model: editModel, imageModel: editImage });
      toast.success('Fallback order saved — gateway reloading');
      setFallbackDirty(false);
      setTimeout(load, 2000);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save fallbacks');
    }
  };

  const addFallback = (type, modelId) => {
    if (type === 'model') {
      setEditModel(prev => ({ ...prev, fallbacks: [...prev.fallbacks, modelId] }));
    } else {
      setEditImage(prev => ({ ...prev, fallbacks: [...prev.fallbacks, modelId] }));
    }
    setFallbackDirty(true);
  };

  const openAgentEdit = (agent) => {
    setEditingAgent(agent);
    setAgentForm({ model: agent.model || '', fallbacks: agent.fallbacks || [] });
    setAgentDialogOpen(true);
  };

  const handleAgentSave = async () => {
    try {
      await updateAgentFallbacks(editingAgent.id, agentForm);
      toast.success(`Fallbacks updated for ${editingAgent.name} — gateway reloading`);
      setAgentDialogOpen(false);
      setTimeout(load, 2000);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save agent fallbacks');
    }
  };

  return (
    <div data-testid="models-page" className="space-y-8">
      {/* === Active Models from CLI === */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Models</h1>
          <p className="text-sm text-zinc-500 mt-1">Active models from gateway (config + environment)</p>
        </div>
        <div className="flex items-center gap-1" data-testid="view-toggle">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-orange-500/15 text-orange-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            aria-label="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-orange-500/15 text-orange-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            aria-label="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {models.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">No models available</div>
          ) : viewMode === 'list' ? (
            <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg overflow-hidden" data-testid="models-list-view">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-800/60">
                    <th className="text-left py-2 pl-4 pr-2 w-10">#</th>
                    <th className="w-6"></th>
                    <th className="text-left py-2 px-2">Model</th>
                    <th className="text-left py-2 px-2">Provider</th>
                    <th className="text-right py-2 px-2">Context</th>
                    <th className="text-left py-2 pl-2 pr-4">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m, index) => (
                    <tr
                      key={m.id}
                      className={`hover:bg-zinc-800/30 transition-colors border-b border-zinc-800/30 last:border-b-0 ${m.is_primary ? 'border-l-2 border-l-orange-500' : 'border-l-2 border-l-transparent'}`}
                    >
                      <td className="py-2 pl-4 pr-2 font-mono text-zinc-500 align-middle">{index + 1}</td>
                      <td className="align-middle">
                        {m.enabled ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        )}
                      </td>
                      <td className="py-2 px-2 align-middle">
                        <div className="font-semibold text-zinc-200 leading-tight">{m.name}</div>
                        <div className="font-mono text-[10px] text-zinc-500 leading-tight">{m.key}</div>
                      </td>
                      <td className="py-2 px-2 font-mono text-zinc-400 align-middle">{m.provider_id || '—'}</td>
                      <td className="py-2 px-2 font-mono text-zinc-400 text-right align-middle whitespace-nowrap">{m.context_window ? `${Number(m.context_window).toLocaleString()}` : '—'}</td>
                      <td className="py-2 pl-2 pr-4 align-middle">
                        <div className="flex flex-wrap gap-1">
                          {m.is_primary && <Star className="w-3.5 h-3.5 text-orange-500 fill-orange-500 shrink-0" />}
                          {m.tags?.map(tag => (
                            <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded font-mono whitespace-nowrap ${tag === 'default' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

          {/* === Fallback Priority === */}
          {fallbackConfig && (
            <div className="pt-4 border-t border-zinc-800/40">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Fallback Priority</h2>
                  <p className="text-sm text-zinc-500 mt-1">Drag to reorder — if the primary model is unavailable, fallbacks are tried in order</p>
                </div>
                {canEdit() && fallbackDirty && (
                  <Button onClick={handleFallbackSave} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                    <Save className="w-4 h-4 mr-2" /> Save Order
                  </Button>
                )}
              </div>

              <Tabs defaultValue="text" className="w-full">
                <TabsList className="bg-zinc-900/50 border border-zinc-800/60 mb-4">
                  <TabsTrigger value="text" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
                    <Cpu className="w-3.5 h-3.5 mr-1.5" /> Text Model
                  </TabsTrigger>
                  <TabsTrigger value="image" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
                    <Image className="w-3.5 h-3.5 mr-1.5" /> Image Model
                  </TabsTrigger>
                </TabsList>

                {['text', 'image'].map(type => {
                  const cfg = type === 'text' ? editModel : editImage;
                  const setCfg = type === 'text' ? setEditModel : setEditImage;
                  const usedModels = [cfg.primary, ...cfg.fallbacks];
                  const availableToAdd = models.filter(m => !usedModels.includes(m.key));
                  return (
                    <TabsContent key={type} value={type} className="space-y-4">
                      {/* Primary */}
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-orange-500/30 bg-orange-500/5">
                        <Star className="w-4 h-4 text-orange-500 fill-orange-500 shrink-0" />
                        <span className="text-xs text-orange-400 font-medium w-14">Primary</span>
                        <Select value={cfg.primary} onValueChange={v => { setCfg(prev => ({ ...prev, primary: v })); setFallbackDirty(true); }}>
                          <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm flex-1 h-8 font-mono">
                            <SelectValue placeholder="Select primary model" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800">
                            {models.map(m => (
                              <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Fallback list */}
                      <SortableFallbackList
                        items={cfg.fallbacks}
                        onReorder={newOrder => { setCfg(prev => ({ ...prev, fallbacks: newOrder })); setFallbackDirty(true); }}
                        onRemove={id => { setCfg(prev => ({ ...prev, fallbacks: prev.fallbacks.filter(f => f !== id) })); setFallbackDirty(true); }}
                        canEdit={canEdit()}
                      />

                      {/* Add fallback */}
                      {canEdit() && availableToAdd.length > 0 && (
                        <Select onValueChange={v => addFallback(type === 'text' ? 'model' : 'image', v)}>
                          <SelectTrigger className="bg-[#050505] border-zinc-800 border-dashed text-sm h-9 text-zinc-500">
                            <Plus className="w-3.5 h-3.5 mr-2" />
                            <SelectValue placeholder="Add fallback model..." />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800">
                            {availableToAdd.map(m => (
                              <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>

              {/* Per-Agent Overrides */}
              {editAgents.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-zinc-300 mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>Per-Agent Overrides</h3>
                  <Accordion type="single" collapsible className="space-y-2">
                    {editAgents.map(agent => (
                      <AccordionItem key={agent.id} value={agent.id} className="border border-zinc-800/60 rounded-lg bg-[#0c0c0e] px-4">
                        <AccordionTrigger className="text-sm text-zinc-300 hover:text-orange-400 py-3">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">{agent.name || agent.id}</span>
                            <span className="font-mono text-[10px] text-zinc-500">{agent.model || '(uses default)'}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-zinc-500">Model</span>
                              <span className="font-mono text-zinc-300">{agent.model || '(default)'}</span>
                            </div>
                            {agent.fallbacks?.length > 0 ? (
                              <div className="space-y-1">
                                <span className="text-xs text-zinc-500">Fallbacks</span>
                                {agent.fallbacks.map((f, i) => (
                                  <div key={f} className="text-xs font-mono text-zinc-400 pl-4">#{i + 1} {f}</div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-zinc-600">No agent-specific fallbacks (uses default list)</div>
                            )}
                            {canEdit() && (
                              <Button variant="ghost" size="sm" onClick={() => openAgentEdit(agent)} className="text-orange-500 hover:bg-orange-500/10 mt-1 h-7 text-xs">
                                <Pencil className="w-3 h-3 mr-1.5" /> Edit Fallbacks
                              </Button>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}
            </div>
          )}

          {/* === Config Providers (CRUD) === */}
          <div className="pt-4 border-t border-zinc-800/40">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Config Providers</h2>
                <p className="text-sm text-zinc-500 mt-1">Manage providers in openclaw.json — changes reload the gateway</p>
              </div>
              {canEdit() && (
                <Button data-testid="create-provider-btn" onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                  <Plus className="w-4 h-4 mr-2" /> Add Provider
                </Button>
              )}
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
                    {canEdit() && (
                      <div className="border-t border-zinc-800/60 px-5 py-3 flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="text-zinc-500 hover:text-orange-500 hover:bg-orange-500/10">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* === Agent Fallback Dialog === */}
      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="bg-[#0c0c0e] border-zinc-800 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
              Edit Fallbacks: {editingAgent?.name || editingAgent?.id}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-zinc-400 text-xs">Model</Label>
              <Select value={agentForm.model} onValueChange={v => setAgentForm(prev => ({ ...prev, model: v }))}>
                <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1 font-mono">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {models.map(m => (
                    <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs mb-2 block">Fallbacks</Label>
              <SortableFallbackList
                items={agentForm.fallbacks}
                onReorder={newOrder => setAgentForm(prev => ({ ...prev, fallbacks: newOrder }))}
                onRemove={id => setAgentForm(prev => ({ ...prev, fallbacks: prev.fallbacks.filter(f => f !== id) }))}
                canEdit={true}
              />
              {(() => {
                const used = [agentForm.model, ...agentForm.fallbacks];
                const available = models.filter(m => !used.includes(m.key));
                return available.length > 0 ? (
                  <Select onValueChange={v => setAgentForm(prev => ({ ...prev, fallbacks: [...prev.fallbacks, v] }))}>
                    <SelectTrigger className="bg-[#050505] border-zinc-800 border-dashed text-sm h-9 text-zinc-500 mt-2">
                      <Plus className="w-3.5 h-3.5 mr-2" />
                      <SelectValue placeholder="Add fallback..." />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {available.map(m => (
                        <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null;
              })()}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800/60">
            <Button variant="outline" onClick={() => setAgentDialogOpen(false)} className="border-zinc-700 text-zinc-400">Cancel</Button>
            <Button onClick={handleAgentSave} className="bg-orange-600 hover:bg-orange-700 text-white">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

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
              <Select value={form.api} onValueChange={v => setForm({...form, api: v})}>
                <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {API_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-zinc-400 text-xs">Models</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addModelRow} className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 h-6 px-2 text-xs">
                  <Plus className="w-3 h-3 mr-1" /> Add Model
                </Button>
              </div>
              <div className="space-y-2">
                {modelRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={row.id} onChange={e => updateModelRow(i, 'id', e.target.value)}
                      className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm flex-[2]" placeholder="model-id" />
                    <Input value={row.name} onChange={e => updateModelRow(i, 'name', e.target.value)}
                      className="bg-[#050505] border-zinc-800 focus:border-orange-500 text-sm flex-[2]" placeholder="Display Name" />
                    <Input value={row.contextWindow} onChange={e => updateModelRow(i, 'contextWindow', e.target.value)}
                      className="bg-[#050505] border-zinc-800 focus:border-orange-500 font-mono text-sm flex-1" placeholder="Context" type="number" />
                    <button type="button" onClick={() => removeModelRow(i)} className="p-1 text-zinc-600 hover:text-red-400 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">Model ID is required. Display name and context window are optional.</p>
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
