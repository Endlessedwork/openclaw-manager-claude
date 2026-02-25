import React, { useEffect, useState } from 'react';
import { getSkills } from '../lib/api';
import { Zap, Search } from 'lucide-react';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';

export default function SkillsPage() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = async () => {
    try { const res = await getSkills(); setSkills(res.data); }
    catch { toast.error('Failed to load skills'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = skills.filter(s =>
    (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const locationBadge = (loc) => {
    const cls = loc === 'bundled' ? 'text-sky-500 bg-sky-500/10 border-sky-500/20' :
      loc === 'managed' ? 'text-violet-500 bg-violet-500/10 border-violet-500/20' :
      'text-orange-500 bg-orange-500/10 border-orange-500/20';
    return <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${cls}`}>{loc}</span>;
  };

  return (
    <div data-testid="skills-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Skills</h1>
          <p className="text-sm text-theme-faint mt-1">Agent skills and capabilities</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-dimmed" />
        <Input data-testid="skill-search" value={search} onChange={e => setSearch(e.target.value)}
          className="pl-10 bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm" placeholder="Search skills..." />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-surface-card border border-subtle rounded-lg divide-y divide-subtle">
          {filtered.length === 0 ? (
            <div className="p-12 text-center"><Zap className="w-12 h-12 text-theme-dimmed mx-auto mb-3" /><p className="text-theme-faint">No skills found</p></div>
          ) : filtered.map(skill => (
            <div key={skill.id} data-testid={`skill-row-${skill.id}`} className="px-5 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${skill.enabled ? 'bg-sky-500/10 border-sky-500/20' : 'bg-muted border-strong'}`}>
                  <Zap className={`w-4 h-4 ${skill.enabled ? 'text-sky-500' : 'text-theme-dimmed'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-theme-primary font-mono">{skill.name}</h3>
                    {locationBadge(skill.location)}
                    {skill.enabled ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-emerald-500 bg-emerald-500/10 border-emerald-500/20">active</span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-theme-dimmed bg-muted border-strong">inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-theme-faint truncate mt-0.5">{skill.description || 'No description'}</p>
                  {skill.requires_env?.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {skill.requires_env.map(env => (
                        <span key={env} className="text-[10px] font-mono px-1 py-0 rounded bg-muted text-theme-faint">{env}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
