import React, { useEffect, useState } from 'react';
import { getSkills } from '../lib/api';
import { Zap, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';

const EMPTY_SKILL = {
  name: '', description: '', location: 'workspace', enabled: true,
  api_key: '', env_vars: {}, config: {}, requires_bins: [],
  requires_env: [], requires_config: [], primary_env: '',
  homepage: '', user_invocable: true, command_dispatch: '',
};

export default function SkillsPage() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_SKILL);

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

  const openCreate = () => { setEditing(null); setForm(EMPTY_SKILL); setDialogOpen(true); };
  const openEdit = (skill) => { setEditing(skill); setForm({ ...skill }); setDialogOpen(true); };

  const handleSave = () => {
    toast.error('Skills are managed via CLI and config file');
    setDialogOpen(false);
  };

  const handleDelete = () => {
    toast.error('Skills are managed via CLI and config file');
  };

  const handleToggle = () => {
    toast.error('Skill toggling is managed via CLI and config file');
  };

  const locationBadge = (loc) => {
    const cls = loc === 'bundled' ? 'text-sky-500 bg-sky-500/10 border-sky-500/20' :
      loc === 'managed' ? 'text-violet-500 bg-violet-500/10 border-violet-500/20' :
      'text-orange-500 bg-orange-500/10 border-orange-500/20';
    return <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${cls}`}>{loc}</span>;
  };

  return (
    <div data-testid="skills-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Skills</h1>
          <p className="text-sm text-theme-faint mt-1">Manage agent skills and capabilities</p>
        </div>
        <Button data-testid="create-skill-btn" onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
          <Plus className="w-4 h-4 mr-2" /> New Skill
        </Button>
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
              <div className="flex items-center gap-2 ml-4">
                <Switch data-testid={`toggle-skill-${skill.id}`} checked={skill.enabled} onCheckedChange={() => handleToggle(skill)} />
                <Button variant="ghost" size="sm" onClick={() => openEdit(skill)} className="text-theme-faint hover:text-orange-500 hover:bg-orange-500/10">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(skill.id)} className="text-theme-faint hover:text-red-500 hover:bg-red-500/10">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>{editing ? 'Edit Skill' : 'Create Skill'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-theme-muted text-xs">Name</Label>
              <Input data-testid="skill-name-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" placeholder="skill-name" />
            </div>
            <div>
              <Label className="text-theme-muted text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                className="bg-surface-sunken border-subtle focus:border-orange-500 text-sm mt-1" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-theme-muted text-xs">Location</Label>
                <Select value={form.location} onValueChange={v => setForm({...form, location: v})}>
                  <SelectTrigger className="bg-surface-sunken border-subtle text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-surface-card border-subtle">
                    <SelectItem value="bundled">Bundled</SelectItem>
                    <SelectItem value="managed">Managed</SelectItem>
                    <SelectItem value="workspace">Workspace</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-theme-muted text-xs">Primary Env</Label>
                <Input value={form.primary_env} onChange={e => setForm({...form, primary_env: e.target.value})}
                  className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" placeholder="API_KEY_NAME" />
              </div>
            </div>
            <div>
              <Label className="text-theme-muted text-xs">API Key</Label>
              <Input type="password" value={form.api_key} onChange={e => setForm({...form, api_key: e.target.value})}
                className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" placeholder="sk-..." />
            </div>
            <div>
              <Label className="text-theme-muted text-xs">Required Env Vars (comma separated)</Label>
              <Input value={(form.requires_env || []).join(', ')} onChange={e => setForm({...form, requires_env: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" />
            </div>
            <div>
              <Label className="text-theme-muted text-xs">Required Bins (comma separated)</Label>
              <Input value={(form.requires_bins || []).join(', ')} onChange={e => setForm({...form, requires_bins: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" />
            </div>
            <div>
              <Label className="text-theme-muted text-xs">Homepage</Label>
              <Input value={form.homepage} onChange={e => setForm({...form, homepage: e.target.value})}
                className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" placeholder="https://..." />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-theme-muted text-xs">Enabled</Label>
              <Switch checked={form.enabled} onCheckedChange={v => setForm({...form, enabled: v})} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-theme-muted text-xs">User Invocable</Label>
              <Switch checked={form.user_invocable} onCheckedChange={v => setForm({...form, user_invocable: v})} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-subtle">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-strong text-theme-muted hover:bg-muted">Cancel</Button>
            <Button data-testid="save-skill-btn" onClick={handleSave} className="bg-orange-600 hover:bg-orange-700 text-white">
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
