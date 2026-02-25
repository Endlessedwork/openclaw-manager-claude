import React, { useEffect, useState, useCallback } from 'react';
import { getProviders, createProvider, updateProvider, deleteProvider, testProviderConnection, fetchProviderModels } from '../lib/api';
import { Server, Plus, Pencil, Trash2, X, Wifi, WifiOff, Loader2, Lock, CheckCircle2, AlertTriangle, Download, Key, Eye, EyeOff } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useGatewayBanner } from '../contexts/GatewayBannerContext';

const EMPTY_PROVIDER = { id: '', base_url: '', api: 'openai-completions', api_key: '' };
const EMPTY_MODEL_ROW = { id: '', name: '', contextWindow: '' };

const API_TYPES = [
  { value: 'openai-completions', label: 'OpenAI Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic' },
  { value: 'google-generative-ai', label: 'Google Gemini' },
  { value: 'bedrock-converse-stream', label: 'AWS Bedrock' },
];

// Provider templates matching openclaw configure
const PROVIDER_TEMPLATES = [
  { id: 'openai', label: 'OpenAI', base_url: 'https://api.openai.com/v1', api: 'openai-completions', env: 'OPENAI_API_KEY', color: 'emerald' },
  { id: 'anthropic', label: 'Anthropic', base_url: 'https://api.anthropic.com/v1', api: 'anthropic-messages', env: 'ANTHROPIC_API_KEY', color: 'orange' },
  { id: 'google', label: 'Google Gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta', api: 'google-generative-ai', env: 'GEMINI_API_KEY', color: 'sky' },
  { id: 'openrouter', label: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', api: 'openai-completions', env: 'OPENROUTER_API_KEY', color: 'purple' },
  { id: 'groq', label: 'Groq', base_url: 'https://api.groq.com/openai/v1', api: 'openai-completions', env: 'GROQ_API_KEY', color: 'amber' },
  { id: 'mistral', label: 'Mistral', base_url: 'https://api.mistral.ai/v1', api: 'openai-completions', env: 'MISTRAL_API_KEY', color: 'blue' },
  { id: 'xai', label: 'xAI (Grok)', base_url: 'https://api.x.ai/v1', api: 'openai-completions', env: 'XAI_API_KEY', color: 'slate' },
  { id: 'cerebras', label: 'Cerebras', base_url: 'https://api.cerebras.ai/v1', api: 'openai-completions', env: 'CEREBRAS_API_KEY', color: 'rose' },
  { id: 'deepseek', label: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', api: 'openai-completions', env: 'DEEPSEEK_API_KEY', color: 'indigo' },
  { id: 'moonshot', label: 'Moonshot (Kimi)', base_url: 'https://api.moonshot.ai/v1', api: 'openai-completions', env: 'MOONSHOT_API_KEY', color: 'yellow' },
  { id: 'minimax', label: 'MiniMax', base_url: 'https://api.minimax.chat/v1', api: 'openai-completions', env: 'MINIMAX_API_KEY', color: 'teal' },
  { id: 'venice', label: 'Venice', base_url: 'https://api.venice.ai/api/v1', api: 'openai-completions', env: 'VENICE_API_KEY', color: 'fuchsia' },
  { id: 'chutes', label: 'Chutes', base_url: 'https://api.chutes.ai/v1', api: 'openai-completions', env: 'CHUTES_API_KEY', color: 'lime' },
  { id: 'ollama', label: 'Ollama (Local)', base_url: 'http://127.0.0.1:11434/v1', api: 'openai-completions', env: 'OLLAMA_API_KEY', color: 'zinc' },
  { id: 'qianfan', label: 'Qianfan (Baidu)', base_url: 'https://qianfan.baidubce.com/v2', api: 'openai-completions', env: 'QIANFAN_API_KEY', color: 'red' },
];

const PROVIDER_COLORS = {
  openai: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-500' },
  anthropic: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' },
  google: { bg: 'bg-sky-500/10', border: 'border-sky-500/20', text: 'text-sky-500' },
  openrouter: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' },
  zai: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
  groq: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-500' },
  mistral: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-500' },
  xai: { bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-400' },
  cerebras: { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-500' },
  deepseek: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-500' },
  moonshot: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-500' },
  minimax: { bg: 'bg-teal-500/10', border: 'border-teal-500/20', text: 'text-teal-500' },
  venice: { bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20', text: 'text-fuchsia-500' },
  chutes: { bg: 'bg-lime-500/10', border: 'border-lime-500/20', text: 'text-lime-500' },
  ollama: { bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', text: 'text-zinc-400' },
  qianfan: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-500' },
};
const DEFAULT_COLOR = { bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-500' };

function getColor(pid) {
  return PROVIDER_COLORS[pid] || DEFAULT_COLOR;
}

export default function ProvidersPage() {
  const { canEdit } = useAuth();
  const { markRestartNeeded } = useGatewayBanner();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PROVIDER);
  const [modelRows, setModelRows] = useState([{ ...EMPTY_MODEL_ROW }]);
  const [testing, setTesting] = useState({});
  const [fetchingModels, setFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState(null); // null = not fetched, [] = fetched empty
  const [showTemplates, setShowTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

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
    setAvailableModels(null);
    setShowApiKey(false);
    setShowTemplates(true);
    setDialogOpen(true);
  };

  const applyTemplate = (tpl) => {
    setForm({ id: tpl.id, base_url: tpl.base_url, api: tpl.api, api_key: '' });
    setModelRows([{ ...EMPTY_MODEL_ROW }]);
    setShowTemplates(false);
  };

  const openEdit = (p) => {
    setEditing(p);
    // For built-in providers without base_url, fill from template if available
    const tpl = PROVIDER_TEMPLATES.find(t => t.id === p.id);
    const baseUrl = p.base_url || (tpl ? tpl.base_url : '');
    const apiType = p.api || (tpl ? tpl.api : 'openai-completions');
    setForm({ id: p.id, base_url: baseUrl, api: apiType, api_key: '' });
    setAvailableModels(null);
    setShowApiKey(false);
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
    setSaving(true);
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
        toast.success(`Provider ${editing.source === 'builtin' ? 'overridden' : 'updated'}`);
      } else {
        await createProvider(payload);
        toast.success('Provider created');
      }
      markRestartNeeded();
      setDialogOpen(false);
      setTimeout(load, 2000);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Delete provider "${id}"?`)) return;
    try {
      await deleteProvider(id);
      toast.success('Provider deleted');
      markRestartNeeded();
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

  const handleFetchModels = async () => {
    const url = form.base_url?.trim();
    if (!url) { toast.error('Enter a Base URL first'); return; }
    setFetchingModels(true);
    try {
      const pid = editing?.id || form.id || '_new';
      const res = await fetchProviderModels(pid, { base_url: url });
      const data = res.data;
      if (!data.ok) { toast.error(data.error || 'Failed to fetch models'); setAvailableModels(null); return; }
      if (data.models.length === 0) { toast.info('No models returned from provider'); setAvailableModels([]); return; }
      setAvailableModels(data.models);
      toast.success(`Found ${data.models.length} model${data.models.length !== 1 ? 's' : ''} available`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to fetch models');
      setAvailableModels(null);
    } finally {
      setFetchingModels(false);
    }
  };

  const addModelFromList = (m) => {
    const existingIds = new Set(modelRows.map(r => r.id).filter(Boolean));
    if (existingIds.has(m.id)) { toast.info(`${m.id} already added`); return; }
    const cleaned = modelRows.filter(r => r.id.trim());
    setModelRows([...cleaned, { id: m.id, name: m.name || '', contextWindow: m.context_window ? String(m.context_window) : '' }]);
  };

  const addAllModels = () => {
    if (!availableModels) return;
    const existingIds = new Set(modelRows.map(r => r.id).filter(Boolean));
    const newModels = availableModels.filter(m => !existingIds.has(m.id));
    if (newModels.length === 0) { toast.info('All models already added'); return; }
    const cleaned = modelRows.filter(r => r.id.trim());
    const newRows = newModels.map(m => ({ id: m.id, name: m.name || '', contextWindow: m.context_window ? String(m.context_window) : '' }));
    setModelRows([...cleaned, ...newRows]);
    toast.success(`Added ${newRows.length} model${newRows.length !== 1 ? 's' : ''}`);
  };

  const customProviders = providers.filter(p => p.source === 'custom');
  const builtinProviders = providers.filter(p => p.source === 'builtin');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Providers</h1>
          <p className="text-sm text-theme-faint mt-1">All LLM providers powering the gateway — custom and built-in</p>
        </div>
        {canEdit() && (
          <Button onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)] w-fit">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                            <Key className={`w-3.5 h-3.5 ${p.has_api_key ? 'text-emerald-500' : 'text-amber-500/50'}`} title={p.has_api_key ? 'API key configured' : 'No API key'} />
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
                            disabled={testing[p.id] === 'loading'}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                            <Key className={`w-3.5 h-3.5 ${p.has_api_key ? 'text-emerald-500' : 'text-amber-500/50'}`} title={p.has_api_key ? 'API key configured' : 'No API key'} />
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

                      {canEdit() && (
                        <div className="border-t border-subtle px-5 py-3 flex items-center justify-between">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => handleTest(p.id)}
                            disabled={testing[p.id] === 'loading'}
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
                          </div>
                        </div>
                      )}
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
        <DialogContent className={`bg-surface-card border-subtle ${!editing && showTemplates ? 'max-w-2xl' : 'max-w-lg'} max-h-[85vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
              {editing ? `Edit Provider: ${editing.id}` : showTemplates ? 'Choose a Provider' : 'Add Provider'}
            </DialogTitle>
          </DialogHeader>

          {/* Template picker for new providers */}
          {!editing && showTemplates ? (
            <div className="space-y-3 mt-2">
              <p className="text-xs text-theme-faint">Select a provider to auto-fill settings, or configure manually.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {PROVIDER_TEMPLATES.filter(t => !providers.some(p => p.id === t.id)).map(tpl => {
                  const color = getColor(tpl.id);
                  return (
                    <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                      className={`flex items-center gap-2.5 p-3 rounded-lg border ${color.border} ${color.bg} hover:brightness-125 transition-all text-left`}>
                      <Server className={`w-4 h-4 ${color.text} shrink-0`} />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-theme-primary truncate">{tpl.label}</div>
                        <div className="text-[9px] font-mono text-theme-dimmed truncate">{tpl.env}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="pt-2 border-t border-subtle">
                <Button variant="ghost" size="sm" onClick={() => setShowTemplates(false)} className="text-theme-faint hover:text-orange-500 text-xs">
                  Custom provider...
                </Button>
              </div>
            </div>
          ) : (
          <>
          <div className="space-y-4 mt-2">
            {!editing && (
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-theme-muted text-xs">Provider ID</Label>
                  <button onClick={() => setShowTemplates(true)} className="text-[10px] text-sky-500 hover:text-sky-400">
                    Pick from templates
                  </button>
                </div>
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
              <Label className="text-theme-muted text-xs">API Key</Label>
              <div className="relative mt-1">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={form.api_key}
                  onChange={e => setForm({...form, api_key: e.target.value})}
                  className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm pr-10"
                  placeholder={editing?.has_api_key ? '••••••••  (key configured — leave blank to keep)' : `Paste your ${(PROVIDER_TEMPLATES.find(t => t.id === form.id)?.env) || 'API key'}...`}
                />
                <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-dimmed hover:text-theme-muted p-1">
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {editing?.has_api_key && !form.api_key && (
                <p className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1">
                  <Key className="w-3 h-3" /> API key is configured
                </p>
              )}
              {!editing?.has_api_key && !form.api_key && (
                <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                  <Key className="w-3 h-3" /> No API key found — Test will show "auth required"
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-theme-muted text-xs">Models</Label>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={handleFetchModels} disabled={fetchingModels || !form.base_url?.trim()}
                    className="text-sky-500 hover:text-sky-400 hover:bg-sky-500/10 h-6 px-2 text-xs">
                    {fetchingModels ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                    {availableModels ? 'Refresh' : 'Fetch Models'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={addModelRow} className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 h-6 px-2 text-xs">
                    <Plus className="w-3 h-3 mr-1" /> Manual
                  </Button>
                </div>
              </div>

              {/* Available models dropdown (after fetch) */}
              {availableModels && availableModels.length > 0 && (
                <div className="mb-3 border border-sky-500/20 rounded-lg bg-sky-500/5 p-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-sky-400 font-medium">
                      {availableModels.length} model{availableModels.length !== 1 ? 's' : ''} available
                    </span>
                    <button type="button" onClick={addAllModels} className="text-[10px] text-sky-400 hover:text-sky-300 font-medium">
                      Add all
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {availableModels.map(m => {
                      const alreadyAdded = modelRows.some(r => r.id === m.id);
                      return (
                        <button key={m.id} type="button" onClick={() => !alreadyAdded && addModelFromList(m)}
                          disabled={alreadyAdded}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left text-xs transition-colors ${
                            alreadyAdded
                              ? 'opacity-40 cursor-default'
                              : 'hover:bg-sky-500/10 cursor-pointer'
                          }`}>
                          <div className="flex items-center gap-2 min-w-0">
                            {alreadyAdded
                              ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                              : <Plus className="w-3 h-3 text-sky-400 shrink-0" />
                            }
                            <span className="font-mono text-theme-primary truncate">{m.id}</span>
                          </div>
                          {m.owned_by && <span className="text-theme-dimmed text-[10px] shrink-0 ml-2">{m.owned_by}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected models */}
              {modelRows.some(r => r.id.trim()) && (
                <div className="text-[10px] uppercase tracking-wider text-theme-dimmed font-medium mb-1">
                  Selected models ({modelRows.filter(r => r.id.trim()).length})
                </div>
              )}
              <div className="space-y-2">
                {modelRows.map((row, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Input value={row.id} onChange={e => updateModelRow(i, 'id', e.target.value)}
                      className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm flex-[2] min-w-[120px]" placeholder="model-id" />
                    <Input value={row.name} onChange={e => updateModelRow(i, 'name', e.target.value)}
                      className="bg-surface-sunken border-subtle focus:border-orange-500 text-sm flex-[2] min-w-[120px]" placeholder="Display Name" />
                    <Input value={row.contextWindow} onChange={e => updateModelRow(i, 'contextWindow', e.target.value)}
                      className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm flex-1 min-w-[80px]" placeholder="Context" type="number" />
                    <button type="button" onClick={() => removeModelRow(i)} className="p-1 text-theme-dimmed hover:text-red-400 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-theme-dimmed mt-1">Click models above to add, or type manually.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-subtle">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} className="border-strong text-theme-muted">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : editing ? 'Update' : 'Create'}
            </Button>
          </div>
          </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
