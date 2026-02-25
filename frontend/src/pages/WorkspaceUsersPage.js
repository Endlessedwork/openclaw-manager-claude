import React, { useEffect, useState, useMemo } from 'react';
import { getWorkspaceUsers, patchWorkspaceUser } from '../lib/api';
import { UserCircle, RefreshCw, Search, Loader2, Pencil } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const ROLES = ['guest', 'member', 'vip', 'admin', 'owner', 'developer', 'blocked'];
const STATUSES = ['new', 'active', 'inactive', 'blocked'];
const PLATFORMS = ['line', 'telegram'];

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function WorkspaceUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ role: '', status: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const { canEdit } = useAuth();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getWorkspaceUsers();
      setUsers(res.data);
    } catch {
      toast.error('Failed to load bot users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = users;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.display_name || '').toLowerCase().includes(q) ||
        (u.user_id || '').toLowerCase().includes(q)
      );
    }
    if (filterPlatform !== 'all') list = list.filter(u => u.platform === filterPlatform);
    if (filterRole !== 'all') list = list.filter(u => u.role === filterRole);
    return list;
  }, [users, search, filterPlatform, filterRole]);

  const openEdit = (u) => {
    setEditing(u);
    setForm({ role: u.role || 'guest', status: u.status || 'new', notes: u.notes || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchWorkspaceUser(editing._file, {
        role: form.role,
        status: form.status,
        notes: form.notes,
      });
      toast.success('User updated');
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const roleBadge = (role) => {
    const config = {
      owner:     { bg: 'bg-amber-500',  text: 'text-white', icon: '🏆' },
      admin:     { bg: 'bg-orange-500',  text: 'text-white', icon: '👑' },
      developer: { bg: 'bg-emerald-500', text: 'text-white', icon: '💻' },
      vip:       { bg: 'bg-purple-500',  text: 'text-white', icon: '⭐' },
      member:    { bg: 'bg-sky-500',     text: 'text-white', icon: '👤' },
      guest:     { bg: 'bg-zinc-600',    text: 'text-zinc-100', icon: '🔹' },
      blocked:   { bg: 'bg-red-600',     text: 'text-white', icon: '🚫' },
    };
    const c = config[role] || config.guest;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold shadow-sm ${c.bg} ${c.text}`}>
        <span className="text-[10px]">{c.icon}</span>
        {role}
      </span>
    );
  };

  const platformBadge = (platform) => {
    const colors = {
      line: 'bg-green-500/20 text-green-400',
      telegram: 'bg-blue-500/20 text-blue-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[platform] || 'bg-zinc-500/20 text-zinc-400'}`}>
        {platform}
      </span>
    );
  };

  const statusBadge = (status) => {
    const config = {
      active:   { bg: 'bg-green-500',  text: 'text-white', dot: 'bg-green-200' },
      new:      { bg: 'bg-blue-500',   text: 'text-white', dot: 'bg-blue-200' },
      inactive: { bg: 'bg-zinc-600',   text: 'text-zinc-100', dot: 'bg-zinc-300' },
      blocked:  { bg: 'bg-red-600',    text: 'text-white', dot: 'bg-red-200' },
    };
    const c = config[status] || config.new;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold shadow-sm ${c.bg} ${c.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
        {status || 'unknown'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-theme-primary flex items-center gap-2">
            <UserCircle className="w-6 h-6 text-orange-500" /> Bot Users
          </h1>
          <p className="text-theme-faint text-sm mt-1">
            {users.length} users across all platforms
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}
          className="border-subtle text-theme-secondary hover:text-theme-primary">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-faint" />
          <Input
            placeholder="Search by name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-surface-card border-subtle text-theme-primary"
          />
        </div>
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-[140px] bg-surface-card border-subtle text-theme-primary">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            <SelectItem value="all">All Platforms</SelectItem>
            {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-[130px] bg-surface-card border-subtle text-theme-primary">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            <SelectItem value="all">All Roles</SelectItem>
            {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-theme-faint">No users found</div>
      ) : (
        <div className="bg-surface-card border border-subtle rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-subtle">
                <th className="text-left px-4 py-3 text-theme-faint font-medium">User</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Platform</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Role</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Status</th>
                <th className="text-left px-4 py-3 text-theme-faint font-medium">Last Seen</th>
                {canEdit() && <th className="text-right px-4 py-3 text-theme-faint font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u._file} className="border-b border-subtle last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-theme-primary font-medium">{u.display_name || 'Unknown'}</div>
                    <div className="text-theme-faint text-xs font-mono">{u.user_id}</div>
                  </td>
                  <td className="px-4 py-3">{platformBadge(u.platform)}</td>
                  <td className="px-4 py-3">{roleBadge(u.role)}</td>
                  <td className="px-4 py-3">{statusBadge(u.status)}</td>
                  <td className="px-4 py-3 text-theme-faint text-xs">{timeAgo(u.last_seen_at)}</td>
                  {canEdit() && (
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(u)}
                        data-testid={`edit-user-${u._file}`}
                        className="text-theme-faint hover:text-orange-400">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-md">
          <DialogHeader>
            <DialogTitle className="text-theme-primary">
              Edit {editing?.display_name || 'User'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-theme-faint mb-1 block">Role</label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="bg-surface-page border-subtle text-theme-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle">
                  {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-theme-faint mb-1 block">Status</label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="bg-surface-page border-subtle text-theme-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle">
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-theme-faint mb-1 block">Notes</label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="bg-surface-page border-subtle text-theme-primary"
                rows={3}
              />
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
