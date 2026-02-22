# Config Form UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a form-based UI with accordion sections to the ConfigPage, togglable with the existing JSON editor via tabs.

**Architecture:** The ConfigPage gets a tab toggle (Form / JSON). Form view parses the raw config JSON into an object and renders 7 accordion sections (Gateway, Agent Defaults, Tools, Messages, Commands, Skills, Plugins) with type-appropriate controls (Select for enums, Switch for booleans, number inputs, password fields, tag inputs). Both views share one config object state. No backend changes needed.

**Tech Stack:** React, Tailwind CSS, shadcn/ui (Accordion, Select, Switch, Input, Label), lucide-react icons

---

### Task 1: Refactor ConfigPage state to use full config object

The current page stores `config` (partial summary) and `rawConfig` (string). We need to store the full parsed config object so the form can read/write individual fields.

**Files:**
- Modify: `frontend/src/pages/ConfigPage.js`
- Test: `frontend/src/pages/ConfigPage.test.js`

**Step 1: Update ConfigPage state and data flow**

Replace the current state approach. Instead of `config` (summary) + `rawConfig` (string), use `fullConfig` (parsed object) + `rawConfig` (string for JSON tab) + `activeTab` ('form' | 'json').

In `frontend/src/pages/ConfigPage.js`, rewrite the state and load function:

```jsx
import React, { useEffect, useState, useCallback } from 'react';
import { getConfig, updateConfig, validateConfig } from '../lib/api';
import {
  FileCode, Save, RotateCcw, CheckCircle, AlertTriangle, XCircle,
  Server, Bot, Wrench, MessageSquare, Terminal, Package, Plug, ChevronDown,
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

export default function ConfigPage() {
  const { canEdit } = useAuth();
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
```

The `handleSave` sends `rawConfig` if on JSON tab, or serialized `fullConfig` if on Form tab:

```jsx
  const handleSave = async () => {
    setSaving(true);
    try {
      const raw = activeTab === 'json' ? rawConfig : JSON.stringify(fullConfig, null, 2);
      await updateConfig({ raw });
      toast.success('Configuration saved');
      setValidation(null);
      load();
    } catch { toast.error('Failed to save config'); }
    finally { setSaving(false); }
  };

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
```

Tab switching syncs data:

```jsx
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
```

**Step 2: Add helper to update nested config paths**

Add this helper inside the component (before the return):

```jsx
  // Deep-set a value at a dot-separated path in fullConfig
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

  // Read a value at a dot-separated path from fullConfig
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
```

**Step 3: Update the test mock to include `raw` with full config**

In `frontend/src/pages/ConfigPage.test.js`, update the mock config:

```js
const mockFullConfig = {
  gateway: { port: 18789, bind: 'loopback', auth: { mode: 'token', token: 'test-token' }, tailscale: { mode: 'off', resetOnExit: false }, controlUi: { allowedOrigins: ['*'] } },
  agents: { defaults: { workspace: '/home/test/.openclaw/workspace', maxConcurrent: 5, compaction: { mode: 'default', memoryFlush: { enabled: true } } } },
  tools: { web: { search: { apiKey: 'test-key' } }, elevated: { enabled: true, allowFrom: { '*': ['*'] } }, sandbox: { tools: { allow: ['exec', 'read'] } } },
  messages: { ackReactionScope: 'group-mentions' },
  commands: { native: 'auto', nativeSkills: 'auto', restart: true },
  skills: { install: { nodeManager: 'npm' } },
  plugins: { entries: { telegram: { enabled: true }, line: { enabled: true } } },
};

const mockConfig = {
  port: 18789,
  bind_host: 'loopback',
  reload_mode: 'local',
  tls: false,
  raw: JSON.stringify(mockFullConfig, null, 2),
};
```

**Step 4: Run tests to verify refactor doesn't break existing tests**

Run: `cd frontend && yarn test -- --testPathPattern=ConfigPage --watchAll=false`

Some existing tests will need updating because the state structure changed. The `config-editor` is now only visible on the JSON tab. Update tests that reference `config-editor` to first switch to JSON tab. The summary cards (Port, Bind Host, etc.) are being removed — they're replaced by the form. Update assertions accordingly.

**Step 5: Commit**

```bash
git add frontend/src/pages/ConfigPage.js frontend/src/pages/ConfigPage.test.js
git commit -m "refactor(config): use full config object state, add tab switching and path helpers"
```

---

### Task 2: Add tab toggle UI and JSON editor view

**Files:**
- Modify: `frontend/src/pages/ConfigPage.js`

**Step 1: Add tab toggle in the header area**

After the page title `<p>` tag and before the buttons div, add a tab toggle. Place it between the title and the action buttons. Below the header section, add:

```jsx
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
```

**Step 2: Conditionally render JSON editor only when activeTab === 'json'**

Wrap the existing JSON editor block in `{activeTab === 'json' && (...)}`

Keep the validation results section always visible (not tab-dependent).

Remove the old 4 summary cards (Port, Bind Host, Reload Mode, TLS) — the form replaces them.

Remove the Config Schema Reference section at the bottom — the form makes it redundant.

**Step 3: Add empty form placeholder for Form tab**

```jsx
      {activeTab === 'form' && fullConfig && (
        <div data-testid="config-form">
          {/* Accordion sections will go here in Task 3 */}
          <p className="text-theme-faint text-sm">Form sections loading...</p>
        </div>
      )}
```

**Step 4: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=ConfigPage --watchAll=false`

**Step 5: Commit**

```bash
git add frontend/src/pages/ConfigPage.js
git commit -m "feat(config): add Form/JSON tab toggle, show JSON editor only on JSON tab"
```

---

### Task 3: Build Gateway accordion section

**Files:**
- Modify: `frontend/src/pages/ConfigPage.js`

**Step 1: Create a reusable TagInput component inside ConfigPage**

This component handles string arrays (like `controlUi.allowedOrigins`). Add above the `ConfigPage` default export:

```jsx
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
```

**Step 2: Create a PasswordInput component**

```jsx
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
```

**Step 3: Create a FormField wrapper component**

```jsx
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
```

**Step 4: Build the Gateway section inside the form area**

Replace the placeholder in the form area with the Accordion. Start with Gateway:

```jsx
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
                  <Input
                    type="number"
                    data-testid="field-gateway-port"
                    value={getConfigValue('gateway.port', 18789)}
                    onChange={e => setConfigValue('gateway.port', parseInt(e.target.value) || 0)}
                    className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm w-32"
                  />
                </FormField>
                <FormField label="Bind" description="Network bind mode">
                  <Select value={getConfigValue('gateway.bind', 'loopback')} onValueChange={v => setConfigValue('gateway.bind', v)}>
                    <SelectTrigger data-testid="field-gateway-bind" className="bg-surface-sunken border-subtle text-sm w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="loopback">loopback</SelectItem>
                      <SelectItem value="lan">lan</SelectItem>
                      <SelectItem value="tailnet">tailnet</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Auth Mode">
                  <Select value={getConfigValue('gateway.auth.mode', 'token')} onValueChange={v => setConfigValue('gateway.auth.mode', v)}>
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="token">token</SelectItem>
                      <SelectItem value="password">password</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Auth Token">
                  <PasswordInput
                    value={getConfigValue('gateway.auth.token', '')}
                    onChange={v => setConfigValue('gateway.auth.token', v)}
                    placeholder="Auth token"
                  />
                </FormField>
                <FormField label="Remote Token">
                  <PasswordInput
                    value={getConfigValue('gateway.remote.token', '')}
                    onChange={v => setConfigValue('gateway.remote.token', v)}
                    placeholder="Remote access token"
                  />
                </FormField>
                <FormField label="Tailscale Mode">
                  <Select value={getConfigValue('gateway.tailscale.mode', 'off')} onValueChange={v => setConfigValue('gateway.tailscale.mode', v)}>
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="off">off</SelectItem>
                      <SelectItem value="on">on</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Tailscale Reset on Exit">
                  <Switch
                    checked={getConfigValue('gateway.tailscale.resetOnExit', false)}
                    onCheckedChange={v => setConfigValue('gateway.tailscale.resetOnExit', v)}
                  />
                </FormField>
                <FormField label="Allowed Origins" description="CORS allowed origins">
                  <TagInput
                    value={getConfigValue('gateway.controlUi.allowedOrigins', [])}
                    onChange={v => setConfigValue('gateway.controlUi.allowedOrigins', v)}
                    placeholder="e.g. https://example.com"
                  />
                </FormField>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
```

**Step 5: Run tests and verify**

Run: `cd frontend && yarn test -- --testPathPattern=ConfigPage --watchAll=false`

**Step 6: Commit**

```bash
git add frontend/src/pages/ConfigPage.js
git commit -m "feat(config): add Gateway accordion section with form controls"
```

---

### Task 4: Build Agent Defaults, Tools, and Messages sections

**Files:**
- Modify: `frontend/src/pages/ConfigPage.js`

**Step 1: Add Agent Defaults section**

Add after the Gateway AccordionItem, inside the same Accordion:

```jsx
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
                  <Input
                    data-testid="field-agents-workspace"
                    value={getConfigValue('agents.defaults.workspace', '')}
                    onChange={e => setConfigValue('agents.defaults.workspace', e.target.value)}
                    className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm"
                  />
                </FormField>
                <FormField label="Max Concurrent" description="Maximum concurrent agents">
                  <Input
                    type="number"
                    data-testid="field-agents-maxConcurrent"
                    value={getConfigValue('agents.defaults.maxConcurrent', 5)}
                    onChange={e => setConfigValue('agents.defaults.maxConcurrent', parseInt(e.target.value) || 0)}
                    className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm w-32"
                  />
                </FormField>
                <FormField label="Compaction Mode">
                  <Select value={getConfigValue('agents.defaults.compaction.mode', 'default')} onValueChange={v => setConfigValue('agents.defaults.compaction.mode', v)}>
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="default">default</SelectItem>
                      <SelectItem value="safeguard">safeguard</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Memory Flush" description="Enable memory flush on compaction">
                  <Switch
                    checked={getConfigValue('agents.defaults.compaction.memoryFlush.enabled', false)}
                    onCheckedChange={v => setConfigValue('agents.defaults.compaction.memoryFlush.enabled', v)}
                  />
                </FormField>
              </AccordionContent>
            </AccordionItem>
```

**Step 2: Add Tools section**

For the `elevated.allowFrom` per-channel grid and `sandbox.tools.allow` multi-select, use specialized inline rendering:

```jsx
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
                  <PasswordInput
                    value={getConfigValue('tools.web.search.apiKey', '')}
                    onChange={v => setConfigValue('tools.web.search.apiKey', v)}
                    placeholder="API key for web search"
                  />
                </FormField>
                <FormField label="Elevated Tools" description="Allow elevated tool execution">
                  <Switch
                    checked={getConfigValue('tools.elevated.enabled', false)}
                    onCheckedChange={v => setConfigValue('tools.elevated.enabled', v)}
                  />
                </FormField>
                <FormField label="Elevated Allow From" description="Per-channel elevated permissions">
                  {Object.entries(getConfigValue('tools.elevated.allowFrom', {})).map(([channel, patterns]) => (
                    <div key={channel} className="mb-3">
                      <span className="text-[10px] font-mono text-theme-dimmed uppercase tracking-wider">{channel}</span>
                      <TagInput
                        value={patterns}
                        onChange={v => setConfigValue(`tools.elevated.allowFrom.${channel}`, v)}
                        placeholder="Pattern (e.g. *)"
                      />
                    </div>
                  ))}
                </FormField>
                <FormField label="Sandbox Tools Allow" description="Allowed sandbox tool names">
                  <TagInput
                    value={getConfigValue('tools.sandbox.tools.allow', [])}
                    onChange={v => setConfigValue('tools.sandbox.tools.allow', v)}
                    placeholder="Tool name (e.g. exec, read, write)"
                  />
                </FormField>
              </AccordionContent>
            </AccordionItem>
```

**Step 3: Add Messages section**

```jsx
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
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="group-mentions">group-mentions</SelectItem>
                      <SelectItem value="all">all</SelectItem>
                      <SelectItem value="none">none</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </AccordionContent>
            </AccordionItem>
```

**Step 4: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=ConfigPage --watchAll=false`

**Step 5: Commit**

```bash
git add frontend/src/pages/ConfigPage.js
git commit -m "feat(config): add Agent Defaults, Tools, and Messages form sections"
```

---

### Task 5: Build Commands, Skills, and Plugins sections

**Files:**
- Modify: `frontend/src/pages/ConfigPage.js`

**Step 1: Add Commands section**

```jsx
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
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="on">on</SelectItem>
                      <SelectItem value="off">off</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Native Skills" description="Native skill dispatch">
                  <Select value={getConfigValue('commands.nativeSkills', 'auto')} onValueChange={v => setConfigValue('commands.nativeSkills', v)}>
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="on">on</SelectItem>
                      <SelectItem value="off">off</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Restart" description="Allow restart command">
                  <Switch
                    checked={getConfigValue('commands.restart', false)}
                    onCheckedChange={v => setConfigValue('commands.restart', v)}
                  />
                </FormField>
              </AccordionContent>
            </AccordionItem>
```

**Step 2: Add Skills section**

```jsx
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
                    <SelectTrigger className="bg-surface-sunken border-subtle text-sm w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-surface-card border-subtle">
                      <SelectItem value="npm">npm</SelectItem>
                      <SelectItem value="yarn">yarn</SelectItem>
                      <SelectItem value="pnpm">pnpm</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </AccordionContent>
            </AccordionItem>
```

**Step 3: Add Plugins section**

```jsx
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
                {Object.entries(getConfigValue('plugins.entries', {})).map(([name, cfg]) => (
                  <FormField key={name} label={name.charAt(0).toUpperCase() + name.slice(1)} description={`Enable ${name} plugin`}>
                    <Switch
                      checked={cfg?.enabled ?? false}
                      onCheckedChange={v => setConfigValue(`plugins.entries.${name}.enabled`, v)}
                    />
                  </FormField>
                ))}
              </AccordionContent>
            </AccordionItem>
```

Close the `</Accordion>` and `</div>` for the form container.

**Step 4: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=ConfigPage --watchAll=false`

**Step 5: Commit**

```bash
git add frontend/src/pages/ConfigPage.js
git commit -m "feat(config): add Commands, Skills, and Plugins form sections"
```

---

### Task 6: Update tests for the new form UI

**Files:**
- Modify: `frontend/src/pages/ConfigPage.test.js`

**Step 1: Add required component mocks**

Add mocks for the new UI components used:

```js
jest.mock('../components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));
jest.mock('../components/ui/label', () => ({
  Label: ({ children }) => <label>{children}</label>,
}));
jest.mock('../components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, ...props }) => (
    <input type="checkbox" checked={checked} onChange={() => onCheckedChange?.(!checked)} {...props} />
  ),
}));
jest.mock('../components/ui/select', () => ({
  Select: ({ children, value, onValueChange }) => <div data-value={value}>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children, ...props }) => <div {...props}>{children}</div>,
  SelectValue: () => <span />,
}));
jest.mock('../components/ui/accordion', () => ({
  Accordion: ({ children }) => <div>{children}</div>,
  AccordionItem: ({ children }) => <div>{children}</div>,
  AccordionTrigger: ({ children }) => <div>{children}</div>,
  AccordionContent: ({ children }) => <div>{children}</div>,
}));
```

Update the lucide-react mock to include the new icons:

```js
jest.mock('lucide-react', () => {
  const icon = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return {
    FileCode: icon('file'), Save: icon('save'), RotateCcw: icon('reset'),
    CheckCircle: icon('check'), AlertTriangle: icon('alert'), XCircle: icon('xcircle'),
    Server: icon('server'), Bot: icon('bot'), Wrench: icon('wrench'),
    MessageSquare: icon('message'), Terminal: icon('terminal'), Package: icon('package'),
    Plug: icon('plug'), ChevronDown: icon('chevron'), Eye: icon('eye'),
    EyeOff: icon('eye-off'), X: icon('x'), Plus: icon('plus'),
  };
});
```

**Step 2: Add test for form tab rendering**

```js
  it('renders form view by default with accordion sections', async () => {
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
    });
    expect(screen.getByText('Gateway')).toBeInTheDocument();
    expect(screen.getByText('Agent Defaults')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Commands')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Plugins')).toBeInTheDocument();
  });
```

**Step 3: Add test for tab switching**

```js
  it('switches to JSON tab and shows editor', async () => {
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-json')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tab-json'));
    expect(screen.getByTestId('config-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('config-form')).not.toBeInTheDocument();
  });
```

**Step 4: Add test for form field values populated from config**

```js
  it('populates form fields from config data', async () => {
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('field-gateway-port')).toBeInTheDocument();
    });
    expect(screen.getByTestId('field-gateway-port')).toHaveValue(18789);
  });
```

**Step 5: Add test for save from form tab**

```js
  it('saves config from form view', async () => {
    const { toast } = require('sonner');
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('save-config-btn'));

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledWith(
        expect.objectContaining({ raw: expect.any(String) })
      );
      expect(toast.success).toHaveBeenCalledWith('Configuration saved');
    });
  });
```

**Step 6: Update existing tests that broke**

- Tests expecting `config-editor` on initial render: add `fireEvent.click(screen.getByTestId('tab-json'))` before asserting `config-editor`.
- Tests expecting summary cards (Port, Bind Host, etc. as `<p>` tags): update to check form fields instead.
- The `raw_config` mock key should become `raw` to match the actual API response.

**Step 7: Run all tests**

Run: `cd frontend && yarn test -- --testPathPattern=ConfigPage --watchAll=false`

Expected: All tests pass.

**Step 8: Commit**

```bash
git add frontend/src/pages/ConfigPage.test.js
git commit -m "test(config): update tests for form UI with accordion sections and tab switching"
```

---

### Task 7: Visual polish and final integration test

**Files:**
- Modify: `frontend/src/pages/ConfigPage.js` (minor tweaks if needed)

**Step 1: Build and visually inspect**

Run: `cd frontend && yarn build`

If the build succeeds, deploy to test:

```bash
docker cp /home/ubuntu/openclaw-manager/frontend/build/. repo-frontend-1:/usr/share/nginx/openclaw-manager/ && docker exec repo-frontend-1 nginx -s reload
```

**Step 2: Manual visual check**

Navigate to `https://control.winecore.work/config` and verify:
- Form tab shows by default with 7 accordion sections
- Each section expands/collapses
- Fields show correct values from config
- Switching to JSON tab shows the raw editor
- Switching back to Form parses correctly
- Save works from both tabs
- Validate works from both tabs

**Step 3: Run full test suite**

Run: `cd frontend && yarn test -- --watchAll=false`

**Step 4: Final commit and push**

```bash
git add -A frontend/src/pages/ConfigPage.js frontend/src/pages/ConfigPage.test.js
git commit -m "feat(config): complete form UI with accordion sections, tab toggle, and form controls"
git push
```
