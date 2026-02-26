import React, { useEffect, useState, useMemo } from 'react';
import { getWorkspaceGroups, patchWorkspaceGroup } from '../lib/api';
import { UsersRound, RefreshCw, Search, Loader2, Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const STATUSES = ['active', 'inactive', 'blocked'];

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function WorkspaceGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ status: '' });
  const [saving, setSaving] = useState(false);
  const { canEdit } = useAuth();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getWorkspaceGroups();
      setGroups(res.data);
    } catch {
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = groups;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(g =>
        (g.group_name || '').toLowerCase().includes(q) ||
        (g.group_id || '').toLowerCase().includes(q)
      );
    }
    if (filterPlatform !== 'all') list = list.filter(g => g.platform === filterPlatform);
    return list;
  }, [groups, search, filterPlatform]);

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const openEdit = (g) => {
    setEditing(g);
    setForm({ status: g.status || 'active' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchWorkspaceGroup(editing._file, { status: form.status });
      toast.success('Group updated');
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status) => {
    const colors = {
      active: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      inactive: 'text-theme-faint bg-muted border-strong',
      blocked: 'text-red-500 bg-red-500/10 border-red-500/20',
    };
    return (
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${colors[status] || colors.active}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
            <UsersRound className="w-6 h-6 text-orange-500" /> Groups
          </h1>
          <p className="text-theme-faint text-sm mt-1">{groups.length} groups</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}
          className="border-subtle text-theme-secondary hover:text-theme-primary">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-faint" />
          <Input placeholder="Search groups..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-surface-card border-subtle text-theme-primary" />
        </div>
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-[140px] bg-surface-card border-subtle text-theme-primary">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="line">line</SelectItem>
            <SelectItem value="telegram">telegram</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-theme-faint">No groups found</div>
      ) : (
        <div className="bg-surface-card border border-subtle rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle">
                <th className="w-8"></th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Group</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Platform</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Status</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Members</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Last Seen</th>
                {canEdit() && <th className="text-right px-4 py-3 text-theme-faint font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => {
                const members = Object.entries(g.members || {});
                const isOpen = expanded[g.group_id];
                return (
                  <React.Fragment key={g._file}>
                    <tr className="border-b border-subtle hover:bg-muted/30 transition-colors">
                      <td className="pl-3">
                        {members.length > 0 && (
                          <button onClick={() => toggle(g.group_id)} className="text-theme-faint hover:text-theme-secondary p-1"
                            data-testid={`expand-group-${g._file}`}>
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-theme-primary font-medium">{g.group_name || 'Unnamed'}</div>
                        <div className="text-theme-faint text-xs font-mono">{g.group_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                          g.platform === 'line' ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                        }`}>{g.platform}</span>
                      </td>
                      <td className="px-4 py-3">{statusBadge(g.status)}</td>
                      <td className="px-4 py-3 text-theme-secondary">{g.member_count || 0}</td>
                      <td className="px-4 py-3 text-theme-faint text-xs">{timeAgo(g.last_seen_at)}</td>
                      {canEdit() && (
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(g)}
                            data-testid={`edit-group-${g._file}`}
                            className="text-theme-faint hover:text-orange-400">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                    {isOpen && members.length > 0 && (
                      <tr className="bg-muted/20">
                        <td colSpan={canEdit() ? 7 : 6} className="px-8 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {members.map(([id, m]) => (
                              <div key={id} className="text-xs bg-surface-page rounded px-2 py-1.5 border border-subtle">
                                <div className="text-theme-secondary font-medium truncate">{m.display_name || id}</div>
                                <div className="text-theme-faint font-mono truncate">{id}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-theme-primary">
              Edit {editing?.group_name || 'Group'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-theme-faint mb-1 block">Status</label>
              <Select value={form.status} onValueChange={v => setForm({ status: v })}>
                <SelectTrigger className="bg-surface-page border-subtle text-theme-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle">
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}
                className="border-subtle text-theme-secondary">Cancel</Button>
              <Button onClick={handleSave} disabled={saving}
                className="bg-orange-600 hover:bg-orange-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
