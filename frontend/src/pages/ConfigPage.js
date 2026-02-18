import React, { useEffect, useState } from 'react';
import { getConfig, updateConfig, validateConfig } from '../lib/api';
import { FileCode, Save, RotateCcw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

export default function ConfigPage() {
  const { canEdit } = useAuth();
  const [config, setConfig] = useState(null);
  const [rawConfig, setRawConfig] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);

  const load = async () => {
    try {
      const res = await getConfig();
      setConfig(res.data);
      setRawConfig(res.data.raw_config || '{}');
      setValidation(null);
    } catch { toast.error('Failed to load config'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await validateConfig({ raw_config: rawConfig });
      setValidation(res.data);
      if (res.data.valid) {
        toast.success('Configuration is valid');
      } else {
        toast.error(`${res.data.errors.length} error(s) found`);
      }
    } catch { toast.error('Validation failed'); }
    finally { setValidating(false); }
  };

  const handleSave = async () => {
    if (!config) { toast.error('Config not loaded'); return; }
    setSaving(true);
    try {
      await updateConfig({ ...config, raw_config: rawConfig });
      toast.success('Configuration saved');
      setValidation(null);
      load();
    } catch { toast.error('Failed to save config'); }
    finally { setSaving(false); }
  };

  return (
    <div data-testid="config-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Configuration</h1>
          <p className="text-sm text-zinc-500 mt-1">Edit openclaw.json gateway configuration</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
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

      {/* Config Settings */}
      {config && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-4">
            <p className="text-xs text-zinc-500 mb-1">Port</p>
            <p className="text-lg font-mono text-zinc-200">{config.port}</p>
          </div>
          <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-4">
            <p className="text-xs text-zinc-500 mb-1">Bind Host</p>
            <p className="text-lg font-mono text-zinc-200">{config.bind_host}</p>
          </div>
          <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-4">
            <p className="text-xs text-zinc-500 mb-1">Reload Mode</p>
            <p className="text-lg font-mono text-zinc-200">{config.reload_mode}</p>
          </div>
          <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-4">
            <p className="text-xs text-zinc-500 mb-1">TLS</p>
            <p className="text-lg font-mono text-zinc-200">{config.tls_enabled ? 'Enabled' : 'Disabled'}</p>
          </div>
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

      {/* Code Editor */}
      <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg overflow-hidden">
        <div className="border-b border-zinc-800/60 p-3 bg-[#101012] flex items-center gap-2">
          <FileCode className="w-4 h-4 text-orange-500" />
          <span className="text-xs font-mono text-zinc-400">~/.openclaw/openclaw.json</span>
          <span className="text-[10px] font-mono text-zinc-700 ml-auto">JSON5</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <textarea
            data-testid="config-editor"
            value={rawConfig}
            onChange={e => { setRawConfig(e.target.value); setValidation(null); }}
            className="w-full min-h-[500px] p-4 bg-[#050505] text-zinc-200 font-mono text-sm resize-y focus:outline-none focus:ring-1 focus:ring-orange-500/30 leading-relaxed"
            spellCheck="false"
          />
        )}
      </div>

      {/* Config Schema Reference */}
      <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>Configuration Reference</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-xs font-mono">
          <div className="space-y-1.5">
            <p className="text-orange-500/80 text-[10px] uppercase tracking-wider mb-1">Agents</p>
            <p className="text-zinc-500">agents.defaults.workspace <span className="text-zinc-700">string</span></p>
            <p className="text-zinc-500">agents.defaults.model.primary <span className="text-zinc-700">string</span></p>
            <p className="text-zinc-500">agents.defaults.model.fallbacks <span className="text-zinc-700">string[]</span></p>
            <p className="text-zinc-500">agents.defaults.heartbeat.every <span className="text-zinc-700">duration</span></p>
            <p className="text-zinc-500">agents.defaults.sandbox.mode <span className="text-zinc-700">off|non-main|all</span></p>
            <p className="text-zinc-500">agents.defaults.compaction.mode <span className="text-zinc-700">default|safeguard</span></p>
            <p className="text-zinc-500">agents.list[] <span className="text-zinc-700">AgentConfig[]</span></p>
          </div>
          <div className="space-y-1.5">
            <p className="text-orange-500/80 text-[10px] uppercase tracking-wider mb-1">Tools & Sessions</p>
            <p className="text-zinc-500">tools.profile <span className="text-zinc-700">full|coding|messaging|minimal</span></p>
            <p className="text-zinc-500">tools.allow / tools.deny <span className="text-zinc-700">string[]</span></p>
            <p className="text-zinc-500">tools.exec.timeoutSec <span className="text-zinc-700">number</span></p>
            <p className="text-zinc-500">tools.web.search.apiKey <span className="text-zinc-700">string</span></p>
            <p className="text-zinc-500">session.dmScope <span className="text-zinc-700">main|per-peer|per-channel-peer</span></p>
            <p className="text-zinc-500">session.reset.mode <span className="text-zinc-700">daily|idle</span></p>
            <p className="text-zinc-500">hooks.enabled <span className="text-zinc-700">boolean</span></p>
          </div>
          <div className="space-y-1.5">
            <p className="text-orange-500/80 text-[10px] uppercase tracking-wider mb-1">Gateway & Channels</p>
            <p className="text-zinc-500">gateway.port <span className="text-zinc-700">number</span></p>
            <p className="text-zinc-500">gateway.bind <span className="text-zinc-700">loopback|lan|tailnet</span></p>
            <p className="text-zinc-500">gateway.auth.mode <span className="text-zinc-700">token|password</span></p>
            <p className="text-zinc-500">gateway.reload.mode <span className="text-zinc-700">hybrid|hot|restart|off</span></p>
            <p className="text-zinc-500">channels.*.dmPolicy <span className="text-zinc-700">pairing|allowlist|open</span></p>
            <p className="text-zinc-500">cron.enabled <span className="text-zinc-700">boolean</span></p>
            <p className="text-zinc-500">skills.entries.* <span className="text-zinc-700">SkillConfig</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
