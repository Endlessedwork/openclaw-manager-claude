import React, { useEffect, useState, useCallback } from 'react';
import { getSkills, toggleSkill } from '../lib/api';
import { Zap, Search, AlertTriangle } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

export default function SkillsPage() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('active');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [toggling, setToggling] = useState({});
  const { canEdit } = useAuth();

  const load = useCallback(async () => {
    try {
      const res = await getSkills();
      setSkills(res.data);
    } catch {
      toast.error('Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Counts
  const activeCount = skills.filter(s => s.enabled).length;
  const inactiveCount = skills.filter(s => !s.enabled).length;
  const allCount = skills.length;

  // Filter by tab
  const tabFiltered = tab === 'active'
    ? skills.filter(s => s.enabled)
    : tab === 'inactive'
      ? skills.filter(s => !s.enabled)
      : skills;

  // Filter by source
  const sourceFiltered = sourceFilter === 'all'
    ? tabFiltered
    : tabFiltered.filter(s => s.source === sourceFilter);

  // Filter by search
  const filtered = sourceFiltered.filter(s =>
    (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleToggle = async (skill) => {
    if (toggling[skill.id]) return;
    const newEnabled = !skill.enabled;

    // Optimistic update
    setSkills(prev => prev.map(s =>
      s.id === skill.id ? { ...s, enabled: newEnabled } : s
    ));
    setToggling(prev => ({ ...prev, [skill.id]: true }));

    try {
      await toggleSkill(skill.name, newEnabled);
      toast.success(`${skill.name} ${newEnabled ? 'enabled' : 'disabled'}`);
    } catch {
      // Revert optimistic update
      setSkills(prev => prev.map(s =>
        s.id === skill.id ? { ...s, enabled: !newEnabled } : s
      ));
      toast.error(`Failed to toggle ${skill.name}`);
    } finally {
      setToggling(prev => ({ ...prev, [skill.id]: false }));
    }
  };

  const sourceBadge = (source) => {
    const cls = source === 'bundled' ? 'text-sky-500 bg-sky-500/10 border-sky-500/20' :
      source === 'managed' ? 'text-violet-500 bg-violet-500/10 border-violet-500/20' :
      'text-orange-500 bg-orange-500/10 border-orange-500/20';
    return <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${cls}`}>{source}</span>;
  };

  const statusBadge = (skill) => {
    if (skill.enabled) {
      return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-emerald-500 bg-emerald-500/10 border-emerald-500/20">active</span>;
    }
    if (skill.disabled) {
      return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-red-500 bg-red-500/10 border-red-500/20">disabled</span>;
    }
    return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-theme-dimmed bg-muted border-strong">inactive</span>;
  };

  const missingText = (missing) => {
    const parts = [];
    if (missing.bins?.length > 0) parts.push(`Missing: ${missing.bins.join(', ')}`);
    if (missing.env?.length > 0) parts.push(`Env: ${missing.env.join(', ')}`);
    if (missing.os?.length > 0) parts.push(`Requires: ${missing.os.join(', ')}`);
    return parts.join(' \u00b7 ');
  };

  const tabs = [
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'inactive', label: 'Inactive', count: inactiveCount },
    { key: 'all', label: 'All', count: allCount },
  ];

  return (
    <div data-testid="skills-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Skills</h1>
          <p className="text-sm text-theme-faint mt-1">Agent skills and capabilities</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-subtle">
        {tabs.map(t => (
          <button
            key={t.key}
            data-testid={`tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              tab === t.key
                ? 'text-orange-500'
                : 'text-theme-dimmed hover:text-theme-secondary'
            }`}
          >
            {t.label}
            <span className={`ml-2 text-[11px] font-mono px-1.5 py-0.5 rounded-full ${
              tab === t.key
                ? 'bg-orange-500/10 text-orange-500'
                : 'bg-muted text-theme-dimmed'
            }`}>
              {t.count}
            </span>
            {tab === t.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
            )}
          </button>
        ))}
      </div>

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-dimmed" />
          <Input
            data-testid="skill-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm"
            placeholder="Search skills..."
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger data-testid="source-filter" className="w-full sm:w-44 bg-surface-sunken border-subtle text-sm">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="bundled">Bundled</SelectItem>
            <SelectItem value="managed">Managed</SelectItem>
            <SelectItem value="workspace">Workspace</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Skill List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-surface-card border border-subtle rounded-lg divide-y divide-subtle">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Zap className="w-12 h-12 text-theme-dimmed mx-auto mb-3" />
              <p className="text-theme-faint">No skills found</p>
            </div>
          ) : filtered.map(skill => (
            <div key={skill.id} data-testid={`skill-row-${skill.id}`} className="px-5 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {/* Icon */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border text-base ${
                  skill.enabled ? 'bg-sky-500/10 border-sky-500/20' : 'bg-muted border-strong'
                }`}>
                  {skill.emoji ? (
                    <span>{skill.emoji}</span>
                  ) : (
                    <Zap className={`w-4 h-4 ${skill.enabled ? 'text-sky-500' : 'text-theme-dimmed'}`} />
                  )}
                </div>
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-medium text-theme-primary font-mono">{skill.name}</h3>
                    {sourceBadge(skill.source)}
                    {statusBadge(skill)}
                  </div>
                  <p className="text-xs text-theme-faint truncate mt-0.5">{skill.description || 'No description'}</p>
                  {!skill.eligible && skill.missing && missingText(skill.missing) && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                      <span className="text-[11px] text-yellow-500 font-mono">{missingText(skill.missing)}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Toggle */}
              {canEdit() && (
                <button
                  data-testid={`toggle-${skill.id}`}
                  onClick={() => handleToggle(skill)}
                  disabled={!skill.eligible || toggling[skill.id]}
                  className={`ml-4 relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-[#09090b] ${
                    !skill.eligible
                      ? 'bg-zinc-700 cursor-not-allowed opacity-50'
                      : skill.enabled
                        ? 'bg-emerald-500 cursor-pointer'
                        : 'bg-zinc-600 cursor-pointer'
                  }`}
                  role="switch"
                  aria-checked={skill.enabled}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    skill.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
