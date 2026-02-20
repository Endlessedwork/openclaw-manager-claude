import React, { useEffect, useState, useCallback } from 'react';
import { getClawHubSkills, installClawHubSkill, uninstallClawHubSkill } from '../lib/api';
import { Store, Search, Download, Trash2, Star, ExternalLink, Package, CheckCircle, Key } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const CATEGORIES = ['all', 'web', 'media', 'text', 'coding', 'communication', 'devops', 'productivity', 'general'];

export default function ClawHubPage() {
  const { canEdit } = useAuth();
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [installing, setInstalling] = useState({});
  const [envDialogSkill, setEnvDialogSkill] = useState(null);
  const [envValues, setEnvValues] = useState({});

  const load = useCallback(async (s = search, c = category) => {
    setLoading(true);
    try {
      const res = await getClawHubSkills(s, c);
      setSkills(res.data || []);
    } catch { toast.error('Failed to load ClawHub'); }
    finally { setLoading(false); }
  }, [search, category]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(timer);
  }, [search, category, load]);

  const handleInstallClick = (skill) => {
    if (skill.requires_env?.length > 0) {
      setEnvDialogSkill(skill);
      setEnvValues({});
    } else {
      doInstall(skill, {});
    }
  };

  const doInstall = async (skill, envVars) => {
    setEnvDialogSkill(null);
    setInstalling(prev => ({ ...prev, [skill.id]: true }));
    try {
      await installClawHubSkill(skill.id, envVars);
      toast.success(`Installed ${skill.slug}`);
      load();
    } catch { toast.error('Install failed'); }
    finally { setInstalling(prev => ({ ...prev, [skill.id]: false })); }
  };

  const handleUninstall = async (skill) => {
    if (!window.confirm(`Uninstall ${skill.slug}?`)) return;
    try {
      await uninstallClawHubSkill(skill.id);
      toast.success(`Uninstalled ${skill.slug}`);
      load();
    } catch { toast.error('Uninstall failed'); }
  };

  const catColor = (cat) => {
    const c = { web: 'text-sky-500 bg-sky-500/10 border-sky-500/20', media: 'text-violet-500 bg-violet-500/10 border-violet-500/20', text: 'text-amber-500 bg-amber-500/10 border-amber-500/20', coding: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', communication: 'text-blue-500 bg-blue-500/10 border-blue-500/20', devops: 'text-red-500 bg-red-500/10 border-red-500/20', productivity: 'text-orange-500 bg-orange-500/10 border-orange-500/20', general: 'text-theme-muted bg-muted border-strong' };
    return c[cat] || c.general;
  };

  return (
    <div data-testid="clawhub-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            ClawHub
          </h1>
          <p className="text-sm text-theme-faint mt-1">Browse and install skills from the public registry</p>
        </div>
        <a href="https://clawhub.ai" target="_blank" rel="noopener noreferrer" className="text-xs text-theme-faint hover:text-orange-500 flex items-center gap-1 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" /> clawhub.ai
        </a>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-dimmed" />
          <Input data-testid="clawhub-search" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-surface-sunken border-subtle focus:border-orange-500 text-sm" placeholder="Search skills... (e.g. calendar, postgres, image)" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44 bg-surface-sunken border-subtle text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 text-xs text-theme-faint font-mono">
        <span>{skills.length} skills found</span>
        <span>{skills.filter(s => s.installed).length} installed</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : skills.length === 0 ? (
        <div className="bg-surface-card border border-subtle rounded-lg p-12 text-center">
          <Store className="w-12 h-12 text-theme-dimmed mx-auto mb-3" /><p className="text-theme-faint">No skills found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map(skill => (
            <div key={skill.id} data-testid={`clawhub-skill-${skill.slug}`}
              className={`bg-surface-card border rounded-lg transition-all duration-300 hover:border-orange-500/20 ${skill.installed ? 'border-emerald-500/30' : 'border-subtle'}`}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${catColor(skill.category)}`}>
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-theme-primary">{skill.name}</h3>
                      <span className="text-[10px] font-mono text-theme-faint">@{skill.author}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${catColor(skill.category)}`}>{skill.category}</span>
                </div>
                <p className="text-xs text-theme-faint mb-3 line-clamp-2">{skill.description}</p>

                {/* Tags */}
                {skill.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {skill.tags.slice(0, 4).map(tag => (
                      <span key={tag} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-card border border-subtle text-theme-faint">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-[10px] font-mono text-theme-dimmed">
                  <span className="flex items-center gap-1"><Download className="w-3 h-3" /> {(skill.downloads ?? 0).toLocaleString()}</span>
                  <span className="flex items-center gap-1"><Star className="w-3 h-3" /> {skill.stars}</span>
                  <span>v{skill.version}</span>
                </div>

                {/* Env requirements */}
                {skill.requires_env?.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {skill.requires_env.map(env => (
                      <span key={env} className="text-[9px] font-mono px-1 py-0 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">{env}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-subtle px-5 py-3 flex items-center justify-between">
                {skill.installed ? (
                  <>
                    <span className="flex items-center gap-1 text-xs text-emerald-500 font-mono">
                      <CheckCircle className="w-3.5 h-3.5" /> Installed v{skill.installed_version}
                    </span>
                    {canEdit() && (
                      <Button data-testid={`uninstall-${skill.slug}`} variant="ghost" size="sm" onClick={() => handleUninstall(skill)}
                        className="text-theme-faint hover:text-red-500 hover:bg-red-500/10">
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Uninstall
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-xs text-theme-dimmed font-mono">Not installed</span>
                    {canEdit() && (
                      <Button data-testid={`install-${skill.slug}`} size="sm" onClick={() => handleInstallClick(skill)}
                        disabled={installing[skill.id]}
                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs shadow-[0_0_10px_rgba(249,115,22,0.2)]">
                        <Download className="w-3.5 h-3.5 mr-1" /> {installing[skill.id] ? 'Installing...' : 'Install'}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Env Vars Dialog */}
      <Dialog open={!!envDialogSkill} onOpenChange={(open) => { if (!open) setEnvDialogSkill(null); }}>
        <DialogContent className="bg-zinc-950 border-subtle max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-theme-primary">
              <Key className="w-4 h-4 text-amber-500" /> API Keys Required
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-theme-faint mb-4">
            <span className="font-semibold text-theme-secondary">{envDialogSkill?.name}</span> requires the following environment variables to work.
          </p>
          <div className="space-y-3">
            {envDialogSkill?.requires_env?.map(envKey => (
              <div key={envKey}>
                <Label className="text-xs font-mono text-theme-muted mb-1 block">{envKey}</Label>
                <Input
                  type="password"
                  placeholder={`Enter ${envKey}`}
                  value={envValues[envKey] || ''}
                  onChange={e => setEnvValues(prev => ({ ...prev, [envKey]: e.target.value }))}
                  className="bg-surface-sunken border-subtle focus:border-orange-500 text-sm font-mono"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setEnvDialogSkill(null)} className="text-theme-faint">
              Cancel
            </Button>
            <Button size="sm" onClick={() => doInstall(envDialogSkill, envValues)}
              disabled={envDialogSkill?.requires_env?.some(k => !envValues[k]?.trim())}
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs shadow-[0_0_10px_rgba(249,115,22,0.2)]">
              <Download className="w-3.5 h-3.5 mr-1" /> Install
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
