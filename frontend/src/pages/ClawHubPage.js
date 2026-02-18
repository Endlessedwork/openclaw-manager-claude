import React, { useEffect, useState, useCallback } from 'react';
import { getClawHubSkills, installClawHubSkill, uninstallClawHubSkill } from '../lib/api';
import { Store, Search, Download, Trash2, Star, ExternalLink, Package, CheckCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
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

  const handleInstall = async (skill) => {
    setInstalling(prev => ({ ...prev, [skill.id]: true }));
    try {
      await installClawHubSkill(skill.id);
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
    const c = { web: 'text-sky-500 bg-sky-500/10 border-sky-500/20', media: 'text-violet-500 bg-violet-500/10 border-violet-500/20', text: 'text-amber-500 bg-amber-500/10 border-amber-500/20', coding: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', communication: 'text-blue-500 bg-blue-500/10 border-blue-500/20', devops: 'text-red-500 bg-red-500/10 border-red-500/20', productivity: 'text-orange-500 bg-orange-500/10 border-orange-500/20', general: 'text-zinc-400 bg-zinc-800 border-zinc-700' };
    return c[cat] || c.general;
  };

  return (
    <div data-testid="clawhub-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            ClawHub
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Browse and install skills from the public registry</p>
        </div>
        <a href="https://clawhub.ai" target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-500 hover:text-orange-500 flex items-center gap-1 transition-colors">
          <ExternalLink className="w-3.5 h-3.5" /> clawhub.ai
        </a>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <Input data-testid="clawhub-search" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-[#050505] border-zinc-800 focus:border-orange-500 text-sm" placeholder="Search skills... (e.g. calendar, postgres, image)" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44 bg-[#050505] border-zinc-800 text-sm"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono">
        <span>{skills.length} skills found</span>
        <span>{skills.filter(s => s.installed).length} installed</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : skills.length === 0 ? (
        <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-12 text-center">
          <Store className="w-12 h-12 text-zinc-700 mx-auto mb-3" /><p className="text-zinc-500">No skills found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map(skill => (
            <div key={skill.id} data-testid={`clawhub-skill-${skill.slug}`}
              className={`bg-[#0c0c0e] border rounded-lg transition-all duration-300 hover:border-orange-500/20 ${skill.installed ? 'border-emerald-500/30' : 'border-zinc-800/60'}`}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${catColor(skill.category)}`}>
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-200">{skill.name}</h3>
                      <span className="text-[10px] font-mono text-zinc-500">@{skill.author}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${catColor(skill.category)}`}>{skill.category}</span>
                </div>
                <p className="text-xs text-zinc-500 mb-3 line-clamp-2">{skill.description}</p>

                {/* Tags */}
                {skill.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {skill.tags.slice(0, 4).map(tag => (
                      <span key={tag} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-600">
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
              <div className="border-t border-zinc-800/60 px-5 py-3 flex items-center justify-between">
                {skill.installed ? (
                  <>
                    <span className="flex items-center gap-1 text-xs text-emerald-500 font-mono">
                      <CheckCircle className="w-3.5 h-3.5" /> Installed v{skill.installed_version}
                    </span>
                    {canEdit() && (
                      <Button data-testid={`uninstall-${skill.slug}`} variant="ghost" size="sm" onClick={() => handleUninstall(skill)}
                        className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10">
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Uninstall
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-xs text-zinc-600 font-mono">Not installed</span>
                    {canEdit() && (
                      <Button data-testid={`install-${skill.slug}`} size="sm" onClick={() => handleInstall(skill)}
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
    </div>
  );
}
