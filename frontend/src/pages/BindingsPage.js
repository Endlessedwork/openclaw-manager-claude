import React, { useEffect, useState } from 'react';
import { getBindings, getBindingOptions, createBinding, updateBinding, deleteBinding } from '../lib/api';
import { GitBranch, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';

const PLATFORM_COLORS = {
  line: { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  telegram: { text: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
};

export default function BindingsPage() {
  const [bindings, setBindings] = useState([]);
  const [options, setOptions] = useState({ agents: [], groups: [] });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ agent_id: '', group_id: '', channel: 'line' });
  const [search, setSearch] = useState('');

  const load = async () => {
    try {
      const [bRes, oRes] = await Promise.all([getBindings(), getBindingOptions()]);
      setBindings(bRes.data);
      setOptions(oRes.data);
    } catch {
      toast.error('Failed to load bindings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ agent_id: '', group_id: '', channel: 'line' });
    setDialogOpen(true);
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({ agent_id: b.agent_id, group_id: b.group_id, channel: b.channel });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.agent_id || !form.group_id) {
      toast.error('Please select both an agent and a group');
      return;
    }
    try {
      if (editing) {
        await updateBinding(editing.id, form);
        toast.success('Binding updated');
      } else {
        await createBinding(form);
        toast.success('Binding created');
      }
      setDialogOpen(false);
      load();
    } catch {
      toast.error('Failed to save binding');
    }
  };

  const handleDelete = async (b) => {
    if (!window.confirm(`Remove binding: ${b.group_name} → ${b.agent_name}?`)) return;
    try {
      await deleteBinding(b.id);
      toast.success('Binding deleted');
      load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  // Filter bindings by search
  const filtered = bindings.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.group_name?.toLowerCase().includes(q) ||
      b.agent_name?.toLowerCase().includes(q) ||
      b.agent_id?.toLowerCase().includes(q) ||
      b.channel?.toLowerCase().includes(q)
    );
  });

  // Group bindings by agent for summary
  const agentCounts = {};
  bindings.forEach(b => {
    agentCounts[b.agent_name || b.agent_id] = (agentCounts[b.agent_name || b.agent_id] || 0) + 1;
  });

  // Helper: find selected group's platform to auto-set channel
  const onGroupChange = (groupId) => {
    const group = options.groups.find(g => g.id === groupId);
    setForm({
      ...form,
      group_id: groupId,
      channel: group?.platform || form.channel,
    });
  };

  return (
    <div data-testid="bindings-page" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Bindings</h1>
          <p className="text-sm text-theme-faint mt-1">Manage agent-group routing — which agent handles which chat group</p>
        </div>
        <Button data-testid="create-binding-btn" onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
          <Plus className="w-4 h-4 mr-2" /> New Binding
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface-card border border-subtle rounded-lg p-4">
          <div className="text-2xl font-bold text-theme-primary">{bindings.length}</div>
          <div className="text-xs text-theme-faint mt-1">Total Bindings</div>
        </div>
        {Object.entries(agentCounts).slice(0, 3).map(([name, count]) => (
          <div key={name} className="bg-surface-card border border-subtle rounded-lg p-4">
            <div className="text-2xl font-bold text-theme-primary">{count}</div>
            <div className="text-xs text-theme-faint mt-1 truncate">{name}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-dimmed" />
        <Input
          placeholder="Search bindings..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 bg-surface-sunken border-subtle focus:border-orange-500 text-sm"
        />
      </div>

      {/* Bindings List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-card border border-subtle rounded-lg p-12 text-center">
          <GitBranch className="w-12 h-12 text-theme-dimmed mx-auto mb-3" />
          <p className="text-theme-faint">{search ? 'No bindings match your search' : 'No bindings configured'}</p>
        </div>
      ) : (
        <div className="bg-surface-card border border-subtle rounded-lg divide-y divide-subtle">
          {filtered.map(b => {
            const pColor = PLATFORM_COLORS[b.channel] || PLATFORM_COLORS.line;
            return (
              <div key={b.id} data-testid={`binding-row-${b.id}`} className="px-5 py-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${pColor.bg} ${pColor.border}`}>
                      <GitBranch className={`w-4 h-4 ${pColor.text}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium text-theme-primary">{b.group_name}</h3>
                        <span className="text-theme-dimmed text-xs">→</span>
                        <span className="text-sm font-medium text-orange-500">{b.agent_name}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${pColor.text} ${pColor.bg} ${pColor.border}`}>
                          {b.channel}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-1 text-[10px] font-mono text-theme-dimmed">
                        <span>Agent: {b.agent_id}</span>
                        <span className="truncate">Group: {b.group_id}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(b)} className="text-theme-faint hover:text-orange-500 hover:bg-orange-500/10">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(b)} className="text-theme-faint hover:text-red-500 hover:bg-red-500/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
              {editing ? 'Edit Binding' : 'New Binding'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Group selector */}
            <div>
              <Label className="text-theme-muted text-xs">Group</Label>
              <Select value={form.group_id} onValueChange={onGroupChange}>
                <SelectTrigger className="bg-surface-sunken border-subtle text-sm mt-1">
                  <SelectValue placeholder="Select a group..." />
                </SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle max-h-60">
                  {options.groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      <span className="flex items-center gap-2">
                        <span>{g.name}</span>
                        <span className="text-[10px] font-mono text-theme-dimmed uppercase">{g.platform}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Agent selector */}
            <div>
              <Label className="text-theme-muted text-xs">Agent</Label>
              <Select value={form.agent_id} onValueChange={v => setForm({ ...form, agent_id: v })}>
                <SelectTrigger className="bg-surface-sunken border-subtle text-sm mt-1">
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle">
                  {options.agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex items-center gap-2">
                        {a.emoji && <span>{a.emoji}</span>}
                        <span>{a.name}</span>
                        <span className="text-[10px] font-mono text-theme-dimmed">{a.id}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Channel */}
            <div>
              <Label className="text-theme-muted text-xs">Channel</Label>
              <Select value={form.channel} onValueChange={v => setForm({ ...form, channel: v })}>
                <SelectTrigger className="bg-surface-sunken border-subtle text-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle">
                  <SelectItem value="line">LINE</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-subtle">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-strong text-theme-muted">
              Cancel
            </Button>
            <Button data-testid="save-binding-btn" onClick={handleSave} className="bg-orange-600 hover:bg-orange-700 text-white">
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
