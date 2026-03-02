import React, { useEffect, useState } from 'react';
import { updateAppSettings, getAIChatSettings, updateAIChatSettings } from '../lib/api';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { SlidersHorizontal, Save, Eye, EyeOff, Key, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

export default function GeneralSettingsPage() {
  const { config, refreshConfig } = useAppConfig();
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [form, setForm] = useState({
    app_name: '',
    app_subtitle: '',
    app_version: '',
  });
  const [saving, setSaving] = useState(false);

  // AI settings state
  const [aiSettings, setAiSettings] = useState({ has_api_key: false, key_source: 'none', model: '' });
  const [aiForm, setAiForm] = useState({ api_key: '', model: '' });
  const [showKey, setShowKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  useEffect(() => {
    setForm({
      app_name: config.app_name,
      app_subtitle: config.app_subtitle,
      app_version: config.app_version,
    });
  }, [config]);

  // Load AI settings on mount (superadmin only)
  useEffect(() => {
    if (!isSuperadmin) return;
    getAIChatSettings()
      .then((res) => {
        setAiSettings(res.data);
        setAiForm((prev) => ({ ...prev, model: res.data.model || '' }));
      })
      .catch(() => {});
  }, [isSuperadmin]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAppSettings(form);
      await refreshConfig();
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAiSave = async () => {
    setAiSaving(true);
    try {
      const data = {};
      if (aiForm.api_key) data.api_key = aiForm.api_key;
      if (aiForm.model) data.model = aiForm.model;
      await updateAIChatSettings(data);
      // Refresh settings
      const res = await getAIChatSettings();
      setAiSettings(res.data);
      setAiForm((prev) => ({ ...prev, api_key: '', model: res.data.model || '' }));
      setShowKey(false);
      toast.success('AI settings saved');
    } catch {
      toast.error('Failed to save AI settings');
    } finally {
      setAiSaving(false);
    }
  };

  const hasChanges =
    form.app_name !== config.app_name ||
    form.app_subtitle !== config.app_subtitle ||
    form.app_version !== config.app_version;

  return (
    <div data-testid="general-settings-page" className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
          General Settings
        </h1>
        <p className="text-sm text-theme-faint mt-1">
          {isSuperadmin ? 'Configure application branding and AI settings' : 'Configure application branding'}
        </p>
      </div>

      <div className="bg-surface-card border border-subtle rounded-lg p-6 space-y-6 max-w-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <SlidersHorizontal className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-theme-primary">Branding</h2>
            <p className="text-xs text-theme-faint">These values appear in the sidebar, login page, and dashboard</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-theme-secondary">Application Name</Label>
            <Input
              value={form.app_name}
              onChange={(e) => setForm({ ...form, app_name: e.target.value })}
              placeholder="W.I.N.E"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label className="text-theme-secondary">Subtitle</Label>
            <Input
              value={form.app_subtitle}
              onChange={(e) => setForm({ ...form, app_subtitle: e.target.value })}
              placeholder="Operation Control"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label className="text-theme-secondary">Version</Label>
            <Input
              value={form.app_version}
              onChange={(e) => setForm({ ...form, app_version: e.target.value })}
              placeholder="3.0"
              className="mt-1.5"
            />
          </div>
        </div>

        <div className="pt-2">
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="bg-orange-600 hover:bg-orange-500 text-white"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {isSuperadmin && (
        <div className="bg-surface-card border border-subtle rounded-lg p-6 space-y-6 max-w-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-theme-primary">AI Assistant</h2>
              <p className="text-xs text-theme-faint">Configure the AI chat assistant (System Editor Mode)</p>
            </div>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${aiSettings.has_api_key ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-sm text-theme-secondary">
              {aiSettings.has_api_key
                ? `API key configured (${aiSettings.key_source})`
                : 'API key not configured'}
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-theme-secondary flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                Anthropic API Key
              </Label>
              <div className="relative mt-1.5">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={aiForm.api_key}
                  onChange={(e) => setAiForm({ ...aiForm, api_key: e.target.value })}
                  placeholder={aiSettings.has_api_key ? '••••••••  (leave blank to keep current)' : 'sk-ant-...'}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-faint hover:text-theme-secondary transition-colors"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label className="text-theme-secondary">Model</Label>
              <Input
                value={aiForm.model}
                onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                placeholder="claude-sonnet-4-20250514"
                className="mt-1.5 font-mono text-sm"
              />
            </div>
          </div>

          <div className="pt-2">
            <Button
              onClick={handleAiSave}
              disabled={aiSaving || (!aiForm.api_key && !aiForm.model)}
              className="bg-orange-600 hover:bg-orange-500 text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              {aiSaving ? 'Saving...' : 'Save AI Settings'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
