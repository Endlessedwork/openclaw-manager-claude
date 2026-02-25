import React, { useEffect, useState, useCallback } from 'react';
import { getConfig, updateConfig, validateConfig } from '../lib/api';
import {
  FileCode, Save, RotateCcw, CheckCircle, AlertTriangle, XCircle,
  Server, Bot, Wrench, MessageSquare, Terminal, Package, Plug,
  Eye, EyeOff, X, Plus
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useGatewayBanner } from '../contexts/GatewayBannerContext';

function TagInput({ value = [], onChange, placeholder = 'Add item...' }) {
  const [input, setInput] = useState('');
  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput('');
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/10 border border-orange-500/20 text-xs font-mono text-orange-400">
            {tag}
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="hover:text-red-400">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder={placeholder}
          className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag} className="border-subtle text-theme-muted hover:bg-muted shrink-0">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder = '' }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-dimmed hover:text-theme-muted"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function FormField({ label, description, children }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2 items-start py-3 border-b border-subtle last:border-0">
      <div>
        <Label className="text-xs font-medium text-theme-muted">{label}</Label>
        {description && <p className="text-[10px] text-theme-dimmed mt-0.5">{description}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ChannelAdder({ onAdd }) {
  const [name, setName] = useState('');
  return (
    <div className="flex gap-2 mt-2">
      <Input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (name.trim()) { onAdd(name.trim()); setName(''); } } }}
        placeholder="Channel name (e.g. telegram)"
        className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm"
      />
      <Button type="button" variant="outline" size="sm" onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(''); } }} className="border-subtle text-theme-muted hover:bg-muted shrink-0">
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default function ConfigPage() {
  const { canEdit } = useAuth();
  const { markRestartNeeded } = useGatewayBanner();
  const [fullConfig, setFullConfig] = useState(null);
  const [rawConfig, setRawConfig] = useState('');
  const [activeTab, setActiveTab] = useState('form');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);

  const load = async () => {
    try {
      const res = await getConfig();
      const parsed = JSON.parse(res.data.raw || '{}');
      setFullConfig(parsed);
      setRawConfig(res.data.raw || '{}');
      setValidation(null);
    } catch { toast.error('Failed to load config'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const raw = activeTab === 'json' ? rawConfig : JSON.stringify(fullConfig, null, 2);
      const res = await validateConfig({ raw });
      setValidation(res.data);
      if (res.data.valid) toast.success('Configuration is valid');
      else toast.error(`${res.data.errors.length} error(s) found`);
    } catch { toast.error('Validation failed'); }
    finally { setValidating(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const raw = activeTab === 'json' ? rawConfig : JSON.stringify(fullConfig, null, 2);
      await updateConfig({ raw });
      toast.success('Configuration saved');
      markRestartNeeded();
      setValidation(null);
      load();
    } catch { toast.error('Failed to save config'); }
    finally { setSaving(false); }
  };

  const switchTab = (tab) => {
    if (tab === 'json' && activeTab === 'form') {
      setRawConfig(JSON.stringify(fullConfig, null, 2));
    } else if (tab === 'form' && activeTab === 'json') {
      try {
        setFullConfig(JSON.parse(rawConfig));
      } catch {
        toast.error('Invalid JSON — fix errors before switching to Form view');
        return;
      }
    }
    setActiveTab(tab);
  };

  const setConfigValue = useCallback((path, value) => {
    setFullConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in obj)) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
    setValidation(null);
  }, []);

  const getConfigValue = useCallback((path, defaultValue) => {
    if (!fullConfig) return defaultValue;
    const keys = path.split('.');
    let obj = fullConfig;
    for (const k of keys) {
      if (obj == null || typeof obj !== 'object') return defaultValue;
      obj = obj[k];
    }
    return obj ?? defaultValue;
  }, [fullConfig]);

  return (
    <div data-testid="config-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Configuration</h1>
          <p className="text-sm text-theme-faint mt-1">Edit openclaw.json gateway configuration</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} className="border-strong text-theme-muted hover:bg-muted">
            <RotateCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
          {canEdit() && (
            <Button data-testid="validate-config-btn" variant="outline" onClick={handleValidate} disabled={validating} className="border-sky-500/30 text-sky-500 hover:bg-sky-500/10">
              <CheckCircle className="w-4 h-4 mr-2" /> {validating ? 'Validating...' : 'Validate'}
            </Button>
          )}
          {canEdit() && (
            <Button data-testid="save-config-btn" onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
              <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save Config'}
            </Button>
          )}
        </div>
      </div>

      {/* Tab Toggle */}
      {!loading && fullConfig && (
        <div className="flex items-center gap-1 bg-surface-card border border-subtle rounded-lg p-1 w-fit">
          <button
            data-testid="tab-form"
            onClick={() => switchTab('form')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'form'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'text-theme-faint hover:text-theme-muted hover:bg-muted'
            }`}
          >
            Form
          </button>
          <button
            data-testid="tab-json"
            onClick={() => switchTab('json')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'json'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'text-theme-faint hover:text-theme-muted hover:bg-muted'
            }`}
          >
            JSON
          </button>
        </div>
      )}

      {/* Validation Results */}
      {validation && (
        <div data-testid="validation-results" className={`border rounded-lg p-4 ${validation.valid ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
          <div className="flex items-center gap-2 mb-2">
            {validation.valid ? (
              <><CheckCircle className="w-4 h-4 text-emerald-500" /><span className="text-sm font-medium text-emerald-500">Configuration Valid</span></>
            ) : (
              <><XCircle className="w-4 h-4 text-red-500" /><span className="text-sm font-medium text-red-500">{validation.errors?.length ?? 0} Error(s)</span></>
            )}
          </div>
          {validation.errors?.length > 0 && (
            <div className="space-y-1 mb-2">
              {validation.errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  <span className="font-mono text-red-400">{e}</span>
                </div>
              ))}
            </div>
          )}
          {validation.warnings?.length > 0 && (
            <div className="space-y-1">
              {validation.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <span className="font-mono text-amber-400">{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Form View */}
      {activeTab === 'form' && fullConfig && (
        <div data-testid="config-form">
          <Accordion type="multiple" defaultValue={['gateway']} className="space-y-3">
            {/* Gateway Section */}
            <AccordionItem value="gateway" className="bg-surface-card border border-subtle rounded-lg overflow-hidden px-5">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                    <Server className="w-4 h-4 text-orange-500" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold text-theme-primary" style={{ fontFamily: 'Manrope, sans-serif' }}>Gateway</span>
                    <p className="text-[10px] text-theme-dimmed">Port, bind, auth, tailscale</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-0">
                <FormField label="Port" description="Gateway listening port">
                  <Input type="number" data-testid="field-gateway-port" value={getConfigValue('gateway.port', 18789)} onChange={e => setConfigValue('gateway.port', parseInt(e.target.value) || 0)} className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm w-32" />
                </FormField>
                <FormField label="Bind" description="Network bind mode">
                  <Select value={getConfigValue('gateway.bind', 'loopback')} onValueChange={v => setConfigValue('gateway.bind', v)}>
                    <SelectTrigger data-testid="field-gateway-bind" className="bg-surface-sunken border-subtle text-sm w-48"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="loopback">loopback</SelectItem>
                      <SelectItem value="lan">lan</SelectItem>
                      <SelectItem value="tailnet">tailnet</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Auth Mode">
                  <Select value={getConfigValue('gateway.auth.mode', 'token')} onValueChange={v => setConfigValue('gateway.auth.mode', v)}>
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="token">token</SelectItem>
                      <SelectItem value="password">password</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Auth Token">
                  <PasswordInput value={getConfigValue('gateway.auth.token', '')} onChange={v => setConfigValue('gateway.auth.token', v)} placeholder="Auth token" />
                </FormField>
                <FormField label="Remote Token">
                  <PasswordInput value={getConfigValue('gateway.remote.token', '')} onChange={v => setConfigValue('gateway.remote.token', v)} placeholder="Remote access token" />
                </FormField>
                <FormField label="Tailscale Mode">
                  <Select value={getConfigValue('gateway.tailscale.mode', 'off')} onValueChange={v => setConfigValue('gateway.tailscale.mode', v)}>
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="off">off</SelectItem>
                      <SelectItem value="on">on</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Tailscale Reset on Exit">
                  <Switch checked={getConfigValue('gateway.tailscale.resetOnExit', false)} onCheckedChange={v => setConfigValue('gateway.tailscale.resetOnExit', v)} />
                </FormField>
                <FormField label="Allowed Origins" description="CORS allowed origins">
                  <TagInput value={getConfigValue('gateway.controlUi.allowedOrigins', [])} onChange={v => setConfigValue('gateway.controlUi.allowedOrigins', v)} placeholder="e.g. https://example.com" />
                </FormField>
              </AccordionContent>
            </AccordionItem>

            {/* Agent Defaults Section */}
            <AccordionItem value="agents" className="bg-surface-card border border-subtle rounded-lg overflow-hidden px-5">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-sky-500" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold text-theme-primary" style={{ fontFamily: 'Manrope, sans-serif' }}>Agent Defaults</span>
                    <p className="text-[10px] text-theme-dimmed">Workspace, concurrency, compaction</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-0">
                <FormField label="Workspace" description="Default agent workspace path">
                  <Input data-testid="field-agents-workspace" value={getConfigValue('agents.defaults.workspace', '')} onChange={e => setConfigValue('agents.defaults.workspace', e.target.value)} className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm" />
                </FormField>
                <FormField label="Max Concurrent" description="Maximum concurrent agents">
                  <Input type="number" data-testid="field-agents-maxConcurrent" value={getConfigValue('agents.defaults.maxConcurrent', 5)} onChange={e => setConfigValue('agents.defaults.maxConcurrent', parseInt(e.target.value) || 0)} className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm w-32" />
                </FormField>
                <FormField label="Compaction Mode">
                  <Select value={getConfigValue('agents.defaults.compaction.mode', 'default')} onValueChange={v => setConfigValue('agents.defaults.compaction.mode', v)}>
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="default">default</SelectItem>
                      <SelectItem value="safeguard">safeguard</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Memory Flush" description="Enable memory flush on compaction">
                  <Switch checked={getConfigValue('agents.defaults.compaction.memoryFlush.enabled', false)} onCheckedChange={v => setConfigValue('agents.defaults.compaction.memoryFlush.enabled', v)} />
                </FormField>
              </AccordionContent>
            </AccordionItem>

            {/* Tools Section */}
            <AccordionItem value="tools" className="bg-surface-card border border-subtle rounded-lg overflow-hidden px-5">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                    <Wrench className="w-4 h-4 text-violet-500" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold text-theme-primary" style={{ fontFamily: 'Manrope, sans-serif' }}>Tools</span>
                    <p className="text-[10px] text-theme-dimmed">Web search, elevated permissions, sandbox</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-0">
                <FormField label="Web Search API Key">
                  <PasswordInput value={getConfigValue('tools.web.search.apiKey', '')} onChange={v => setConfigValue('tools.web.search.apiKey', v)} placeholder="API key for web search" />
                </FormField>
                <FormField label="Elevated Tools" description="Allow elevated tool execution">
                  <Switch checked={getConfigValue('tools.elevated.enabled', false)} onCheckedChange={v => setConfigValue('tools.elevated.enabled', v)} />
                </FormField>
                <FormField label="Elevated Allow From" description="Per-channel elevated permissions">
                  {Object.entries(getConfigValue('tools.elevated.allowFrom', {})).map(([channel, patterns]) => (
                    <div key={channel} className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-theme-dimmed uppercase tracking-wider">{channel}</span>
                        <button onClick={() => {
                          const next = { ...getConfigValue('tools.elevated.allowFrom', {}) };
                          delete next[channel];
                          setConfigValue('tools.elevated.allowFrom', next);
                        }} className="text-theme-dimmed hover:text-red-400">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <TagInput value={patterns} onChange={v => setConfigValue(`tools.elevated.allowFrom.${channel}`, v)} placeholder="Pattern (e.g. *)" />
                    </div>
                  ))}
                  <ChannelAdder onAdd={(name) => setConfigValue(`tools.elevated.allowFrom.${name}`, [])} />
                </FormField>
                <FormField label="Sandbox Tools Allow" description="Allowed sandbox tool names">
                  <TagInput value={getConfigValue('tools.sandbox.tools.allow', [])} onChange={v => setConfigValue('tools.sandbox.tools.allow', v)} placeholder="Tool name (e.g. exec, read, write)" />
                </FormField>
              </AccordionContent>
            </AccordionItem>

            {/* Messages Section */}
            <AccordionItem value="messages" className="bg-surface-card border border-subtle rounded-lg overflow-hidden px-5">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold text-theme-primary" style={{ fontFamily: 'Manrope, sans-serif' }}>Messages</span>
                    <p className="text-[10px] text-theme-dimmed">Acknowledgment and reaction settings</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-0">
                <FormField label="Ack Reaction Scope" description="When to show reaction acknowledgments">
                  <Select value={getConfigValue('messages.ackReactionScope', 'group-mentions')} onValueChange={v => setConfigValue('messages.ackReactionScope', v)}>
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="group-mentions">group-mentions</SelectItem>
                      <SelectItem value="all">all</SelectItem>
                      <SelectItem value="none">none</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </AccordionContent>
            </AccordionItem>

            {/* Commands Section */}
            <AccordionItem value="commands" className="bg-surface-card border border-subtle rounded-lg overflow-hidden px-5">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <Terminal className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold text-theme-primary" style={{ fontFamily: 'Manrope, sans-serif' }}>Commands</span>
                    <p className="text-[10px] text-theme-dimmed">Native commands and restart</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-0">
                <FormField label="Native" description="Native command handling">
                  <Select value={getConfigValue('commands.native', 'auto')} onValueChange={v => setConfigValue('commands.native', v)}>
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="on">on</SelectItem>
                      <SelectItem value="off">off</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Native Skills" description="Native skill dispatch">
                  <Select value={getConfigValue('commands.nativeSkills', 'auto')} onValueChange={v => setConfigValue('commands.nativeSkills', v)}>
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="on">on</SelectItem>
                      <SelectItem value="off">off</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Restart" description="Allow restart command">
                  <Switch checked={getConfigValue('commands.restart', false)} onCheckedChange={v => setConfigValue('commands.restart', v)} />
                </FormField>
              </AccordionContent>
            </AccordionItem>

            {/* Skills Section */}
            <AccordionItem value="skills" className="bg-surface-card border border-subtle rounded-lg overflow-hidden px-5">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center">
                    <Package className="w-4 h-4 text-pink-500" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold text-theme-primary" style={{ fontFamily: 'Manrope, sans-serif' }}>Skills</span>
                    <p className="text-[10px] text-theme-dimmed">Skill installation settings</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-0">
                <FormField label="Node Manager" description="Package manager for skill installation">
                  <Select value={getConfigValue('skills.install.nodeManager', 'npm')} onValueChange={v => setConfigValue('skills.install.nodeManager', v)}>
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="npm">npm</SelectItem>
                      <SelectItem value="yarn">yarn</SelectItem>
                      <SelectItem value="pnpm">pnpm</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </AccordionContent>
            </AccordionItem>

            {/* Plugins Section */}
            <AccordionItem value="plugins" className="bg-surface-card border border-subtle rounded-lg overflow-hidden px-5">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <Plug className="w-4 h-4 text-cyan-500" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-semibold text-theme-primary" style={{ fontFamily: 'Manrope, sans-serif' }}>Plugins</span>
                    <p className="text-[10px] text-theme-dimmed">Channel plugin toggles</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-0">
                {[
                  { key: 'telegram', label: 'Telegram' },
                  { key: 'line', label: 'Line' },
                ].map(({ key, label }) => (
                  <FormField key={key} label={`${label} Enabled`} description={`Enable ${label} plugin`}>
                    <Switch
                      checked={getConfigValue(`plugins.entries.${key}.enabled`, false)}
                      onCheckedChange={v => setConfigValue(`plugins.entries.${key}.enabled`, v)}
                    />
                  </FormField>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}

      {/* JSON Editor View */}
      {activeTab === 'json' && (
        <div className="bg-surface-card border border-subtle rounded-lg overflow-hidden">
          <div className="border-b border-subtle p-3 bg-surface-header flex items-center gap-2">
            <FileCode className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-mono text-theme-muted">~/.openclaw/openclaw.json</span>
            <span className="text-[10px] font-mono text-theme-dimmed ml-auto">JSON</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <textarea
              data-testid="config-editor"
              value={rawConfig}
              onChange={e => { setRawConfig(e.target.value); setValidation(null); }}
              className="w-full min-h-[500px] p-4 bg-surface-sunken text-theme-primary font-mono text-sm resize-y focus:outline-none focus:ring-1 focus:ring-orange-500/30 leading-relaxed"
              spellCheck="false"
            />
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      )}
    </div>
  );
}
