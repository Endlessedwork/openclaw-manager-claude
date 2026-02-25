import React, { useEffect, useState, useCallback } from 'react';
import { getModels, getFallbacks, updateFallbacks, updateAgentFallbacks } from '../lib/api';
import { Cpu, Plus, Pencil, Star, AlertTriangle, CheckCircle2, Save, Image, LayoutGrid, List, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import SortableFallbackList from '../components/SortableFallbackList';

export default function ModelsPage() {
  const { canEdit } = useAuth();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fallbackConfig, setFallbackConfig] = useState(null);
  const [editModel, setEditModel] = useState({ primary: '', fallbacks: [] });
  const [editImage, setEditImage] = useState({ primary: '', fallbacks: [] });
  const [editAgents, setEditAgents] = useState([]);
  const [fallbackDirty, setFallbackDirty] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [agentForm, setAgentForm] = useState({ model: '', fallbacks: [] });
  const [viewMode, setViewMode] = useState('grid');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mRes, fRes] = await Promise.all([getModels(), getFallbacks()]);
      setModels(mRes.data);
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

  const handleFallbackSave = async () => {
    setSaving(true);
    try {
      await updateFallbacks({ model: editModel, imageModel: editImage });
      toast.success('Fallback order saved — gateway reloading');
      setFallbackDirty(false);
      setTimeout(load, 2000);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save fallbacks');
    } finally {
      setSaving(false);
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
    setSaving(true);
    try {
      await updateAgentFallbacks(editingAgent.id, agentForm);
      toast.success(`Fallbacks updated for ${editingAgent.name} — gateway reloading`);
      setAgentDialogOpen(false);
      setTimeout(load, 2000);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save agent fallbacks');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="models-page" className="space-y-8">
      {/* === Active Models from CLI === */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Models</h1>
          <p className="text-sm text-theme-faint mt-1">Active models from gateway (config + environment)</p>
        </div>
        <div className="flex items-center gap-1" data-testid="view-toggle">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-orange-500/15 text-orange-500' : 'text-theme-faint hover:text-theme-secondary'}`}
            aria-label="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-orange-500/15 text-orange-500' : 'text-theme-faint hover:text-theme-secondary'}`}
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
            <div className="text-center py-12 text-theme-faint">No models available</div>
          ) : viewMode === 'list' ? (
            <div className="bg-surface-card border border-subtle rounded-lg overflow-x-auto" data-testid="models-list-view">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-theme-faint border-b border-subtle">
                    <th className="text-left py-2 pl-4 pr-2 w-10">#</th>
                    <th className="w-6"></th>
                    <th className="text-left py-2 px-2">Model</th>
                    <th className="text-left py-2 px-2 hidden md:table-cell">Provider</th>
                    <th className="text-right py-2 px-2 hidden md:table-cell">Context</th>
                    <th className="text-left py-2 pl-2 pr-4">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m, index) => (
                    <tr
                      key={m.id}
                      className={`hover:bg-muted/30 transition-colors border-b border-subtle last:border-b-0 ${m.is_primary ? 'border-l-2 border-l-orange-500' : 'border-l-2 border-l-transparent'}`}
                    >
                      <td className="py-2 pl-4 pr-2 font-mono text-theme-faint align-middle">{index + 1}</td>
                      <td className="align-middle">
                        {m.enabled ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        )}
                      </td>
                      <td className="py-2 px-2 align-middle">
                        <div className="font-semibold text-theme-primary leading-tight">{m.name}</div>
                        <div className="font-mono text-[10px] text-theme-faint leading-tight">{m.key}</div>
                      </td>
                      <td className="py-2 px-2 font-mono text-theme-muted align-middle hidden md:table-cell">{m.provider_id || '—'}</td>
                      <td className="py-2 px-2 font-mono text-theme-muted text-right align-middle whitespace-nowrap hidden md:table-cell">{m.context_window ? `${Number(m.context_window).toLocaleString()}` : '—'}</td>
                      <td className="py-2 pl-2 pr-4 align-middle">
                        <div className="flex flex-wrap gap-1">
                          {m.is_primary && <Star className="w-3.5 h-3.5 text-orange-500 fill-orange-500 shrink-0" />}
                          {m.tags?.map(tag => (
                            <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded font-mono whitespace-nowrap ${tag === 'default' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-muted text-theme-muted border border-strong'}`}>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {models.map(m => (
                <div key={m.id} className={`bg-surface-card border rounded-lg hover:border-orange-500/20 transition-all duration-300 ${m.is_primary ? 'border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.08)]' : 'border-subtle'}`}>
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${m.enabled ? 'bg-sky-500/10 border-sky-500/20' : 'bg-muted border-strong'}`}>
                          <Cpu className={`w-4 h-4 ${m.enabled ? 'text-sky-500' : 'text-theme-dimmed'}`} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-theme-primary truncate">{m.name}</h3>
                          <span className="text-[10px] font-mono text-theme-faint">{m.key}</span>
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
                          <span className="text-theme-faint">Provider</span>
                          <span className="font-mono text-theme-secondary">{m.provider_id}</span>
                        </div>
                      )}
                      {m.input && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-theme-faint">Input</span>
                          <span className="font-mono text-theme-secondary">{m.input}</span>
                        </div>
                      )}
                      {m.context_window && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-theme-faint">Context</span>
                          <span className="font-mono text-theme-secondary">{Number(m.context_window).toLocaleString()} tokens</span>
                        </div>
                      )}
                    </div>
                    {m.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {m.tags.map(tag => (
                          <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${tag === 'default' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-muted text-theme-muted border border-strong'}`}>
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

          {/* === Image Model === */}
          {fallbackConfig && (() => {
            const imgUsed = [editImage.primary, ...editImage.fallbacks];
            const imgAvailable = models.filter(m => !imgUsed.includes(m.key));
            return (
              <div className="pt-4 border-t border-subtle">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      <Image className="w-5 h-5 inline-block mr-2 -mt-0.5 text-sky-500" />
                      Image Model
                    </h2>
                    <p className="text-sm text-theme-faint mt-1">Model used for image understanding and vision tasks</p>
                  </div>
                  {canEdit() && fallbackDirty && (
                    <Button onClick={handleFallbackSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                      {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-sky-500/30 bg-sky-500/5">
                    <Star className="w-4 h-4 text-sky-500 fill-sky-500 shrink-0" />
                    <span className="text-xs text-sky-400 font-medium w-14">Primary</span>
                    <Select value={editImage.primary} onValueChange={v => { setEditImage(prev => ({ ...prev, primary: v })); setFallbackDirty(true); }}>
                      <SelectTrigger className="bg-surface-sunken border-subtle text-sm flex-1 h-8 font-mono">
                        <SelectValue placeholder="Select image model" />
                      </SelectTrigger>
                      <SelectContent className="bg-surface-card border-subtle">
                        {models.map(m => (
                          <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <SortableFallbackList
                    items={editImage.fallbacks}
                    onReorder={newOrder => { setEditImage(prev => ({ ...prev, fallbacks: newOrder })); setFallbackDirty(true); }}
                    onRemove={id => { setEditImage(prev => ({ ...prev, fallbacks: prev.fallbacks.filter(f => f !== id) })); setFallbackDirty(true); }}
                    canEdit={canEdit()}
                  />
                  {canEdit() && imgAvailable.length > 0 && (
                    <Select onValueChange={v => addFallback('image', v)}>
                      <SelectTrigger className="bg-surface-sunken border-subtle border-dashed text-sm h-9 text-theme-faint">
                        <Plus className="w-3.5 h-3.5 mr-2" />
                        <SelectValue placeholder="Add fallback model..." />
                      </SelectTrigger>
                      <SelectContent className="bg-surface-card border-subtle">
                        {imgAvailable.map(m => (
                          <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            );
          })()}

          {/* === Text Model Fallback Priority === */}
          {fallbackConfig && (() => {
            const txtUsed = [editModel.primary, ...editModel.fallbacks];
            const txtAvailable = models.filter(m => !txtUsed.includes(m.key));
            return (
              <div className="pt-4 border-t border-subtle">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      <Cpu className="w-5 h-5 inline-block mr-2 -mt-0.5 text-orange-500" />
                      Text Model Fallback
                    </h2>
                    <p className="text-sm text-theme-faint mt-1">Drag to reorder — if the primary model is unavailable, fallbacks are tried in order</p>
                  </div>
                  {canEdit() && fallbackDirty && (
                    <Button onClick={handleFallbackSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                      {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-orange-500/30 bg-orange-500/5">
                    <Star className="w-4 h-4 text-orange-500 fill-orange-500 shrink-0" />
                    <span className="text-xs text-orange-400 font-medium w-14">Primary</span>
                    <Select value={editModel.primary} onValueChange={v => { setEditModel(prev => ({ ...prev, primary: v })); setFallbackDirty(true); }}>
                      <SelectTrigger className="bg-surface-sunken border-subtle text-sm flex-1 h-8 font-mono">
                        <SelectValue placeholder="Select primary model" />
                      </SelectTrigger>
                      <SelectContent className="bg-surface-card border-subtle">
                        {models.map(m => (
                          <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <SortableFallbackList
                    items={editModel.fallbacks}
                    onReorder={newOrder => { setEditModel(prev => ({ ...prev, fallbacks: newOrder })); setFallbackDirty(true); }}
                    onRemove={id => { setEditModel(prev => ({ ...prev, fallbacks: prev.fallbacks.filter(f => f !== id) })); setFallbackDirty(true); }}
                    canEdit={canEdit()}
                  />
                  {canEdit() && txtAvailable.length > 0 && (
                    <Select onValueChange={v => addFallback('model', v)}>
                      <SelectTrigger className="bg-surface-sunken border-subtle border-dashed text-sm h-9 text-theme-faint">
                        <Plus className="w-3.5 h-3.5 mr-2" />
                        <SelectValue placeholder="Add fallback model..." />
                      </SelectTrigger>
                      <SelectContent className="bg-surface-card border-subtle">
                        {txtAvailable.map(m => (
                          <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            );
          })()}

          {/* === Per-Agent Overrides === */}
          {fallbackConfig && editAgents.length > 0 && (
            <div className="pt-4 border-t border-subtle">
              <h2 className="text-2xl font-bold tracking-tight mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>Per-Agent Overrides</h2>
              <Accordion type="single" collapsible className="space-y-2">
                {editAgents.map(agent => (
                  <AccordionItem key={agent.id} value={agent.id} className="border border-subtle rounded-lg bg-surface-card px-4">
                    <AccordionTrigger className="text-sm text-theme-secondary hover:text-orange-400 py-3">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{agent.name || agent.id}</span>
                        <span className="font-mono text-[10px] text-theme-faint">{agent.model || '(uses default)'}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-theme-faint">Model</span>
                          <span className="font-mono text-theme-secondary">{agent.model || '(default)'}</span>
                        </div>
                        {agent.fallbacks?.length > 0 ? (
                          <div className="space-y-1">
                            <span className="text-xs text-theme-faint">Fallbacks</span>
                            {agent.fallbacks.map((f, i) => (
                              <div key={f} className="text-xs font-mono text-theme-muted pl-4">#{i + 1} {f}</div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-theme-dimmed">No agent-specific fallbacks (uses default list)</div>
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

        </>
      )}

      {/* === Agent Fallback Dialog === */}
      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
              Edit Fallbacks: {editingAgent?.name || editingAgent?.id}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-theme-muted text-xs">Model</Label>
              <Select value={agentForm.model} onValueChange={v => setAgentForm(prev => ({ ...prev, model: v }))}>
                <SelectTrigger className="bg-surface-sunken border-subtle text-sm mt-1 font-mono">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle">
                  {models.map(m => (
                    <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-theme-muted text-xs mb-2 block">Fallbacks</Label>
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
                    <SelectTrigger className="bg-surface-sunken border-subtle border-dashed text-sm h-9 text-theme-faint mt-2">
                      <Plus className="w-3.5 h-3.5 mr-2" />
                      <SelectValue placeholder="Add fallback..." />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      {available.map(m => (
                        <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null;
              })()}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-subtle">
            <Button variant="outline" onClick={() => setAgentDialogOpen(false)} disabled={saving} className="border-strong text-theme-muted">Cancel</Button>
            <Button onClick={handleAgentSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
