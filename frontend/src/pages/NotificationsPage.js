import React, { useEffect, useState } from 'react';
import {
  getNotificationRules, getNotificationEventTypes, getNotificationGroups,
  createNotificationRule, updateNotificationRule, deleteNotificationRule, testNotification,
} from '../lib/api';
import { Bell, Plus, Pencil, Trash2, Send, Clock, MessageSquare } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';

const EVENT_COLORS = {
  model_fallback: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
};

const CHANNEL_COLORS = {
  telegram: { text: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
};

function formatAge(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationsPage() {
  const [rules, setRules] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({
    event_type: '',
    channel: 'telegram',
    target: '',
    target_name: '',
    enabled: true,
    cooldown_minutes: 30,
  });

  const load = async () => {
    try {
      const [rRes, eRes, gRes] = await Promise.all([
        getNotificationRules(),
        getNotificationEventTypes(),
        getNotificationGroups(),
      ]);
      setRules(rRes.data);
      setEventTypes(eRes.data);
      setGroups(gRes.data);
    } catch {
      toast.error('Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      event_type: eventTypes[0]?.value || 'model_fallback',
      channel: 'telegram',
      target: '',
      target_name: '',
      enabled: true,
      cooldown_minutes: 30,
    });
    setDialogOpen(true);
  };

  const openEdit = (rule) => {
    setEditing(rule);
    setForm({
      event_type: rule.event_type,
      channel: rule.channel,
      target: rule.target,
      target_name: rule.target_name,
      enabled: rule.enabled,
      cooldown_minutes: rule.cooldown_minutes,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.event_type || !form.target) {
      toast.error('Please select an event type and target group');
      return;
    }
    try {
      if (editing) {
        await updateNotificationRule(editing.id, form);
        toast.success('Rule updated');
      } else {
        await createNotificationRule(form);
        toast.success('Rule created');
      }
      setDialogOpen(false);
      load();
    } catch {
      toast.error('Failed to save rule');
    }
  };

  const handleDelete = async (rule) => {
    const name = rule.target_name || rule.target;
    if (!window.confirm(`Delete notification rule for "${name}"?`)) return;
    try {
      await deleteNotificationRule(rule.id);
      toast.success('Rule deleted');
      load();
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const handleToggle = async (rule) => {
    try {
      await updateNotificationRule(rule.id, { enabled: !rule.enabled });
      setRules(rules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
      toast.success(rule.enabled ? 'Rule disabled' : 'Rule enabled');
    } catch {
      toast.error('Failed to update rule');
    }
  };

  const handleTest = async () => {
    if (!form.target) {
      toast.error('Select a target group first');
      return;
    }
    setTesting(true);
    try {
      const res = await testNotification({ channel: form.channel, target: form.target });
      if (res.data.ok) {
        toast.success('Test notification sent!');
      } else {
        toast.error(`Test failed: ${res.data.error}`);
      }
    } catch {
      toast.error('Failed to send test notification');
    } finally {
      setTesting(false);
    }
  };

  const onGroupChange = (groupId) => {
    const group = groups.find(g => g.id === groupId);
    setForm({
      ...form,
      target: groupId,
      target_name: group?.name || groupId,
    });
  };

  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <div data-testid="notifications-page" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Notifications</h1>
          <p className="text-sm text-theme-faint mt-1">Configure alert rules — get notified when things need attention</p>
        </div>
        <Button data-testid="create-rule-btn" onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
          <Plus className="w-4 h-4 mr-2" /> New Rule
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-surface-card border border-subtle rounded-lg p-4">
          <div className="text-2xl font-bold text-theme-primary">{rules.length}</div>
          <div className="text-xs text-theme-faint mt-1">Total Rules</div>
        </div>
        <div className="bg-surface-card border border-subtle rounded-lg p-4">
          <div className="text-2xl font-bold text-emerald-400">{enabledCount}</div>
          <div className="text-xs text-theme-faint mt-1">Active</div>
        </div>
        <div className="bg-surface-card border border-subtle rounded-lg p-4">
          <div className="text-2xl font-bold text-theme-muted">{rules.length - enabledCount}</div>
          <div className="text-xs text-theme-faint mt-1">Disabled</div>
        </div>
      </div>

      {/* Rules List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-surface-card border border-subtle rounded-lg p-12 text-center">
          <Bell className="w-12 h-12 text-theme-dimmed mx-auto mb-3" />
          <p className="text-theme-faint">No notification rules configured</p>
          <p className="text-xs text-theme-dimmed mt-1">Create a rule to get alerted when something needs attention</p>
        </div>
      ) : (
        <div className="bg-surface-card border border-subtle rounded-lg divide-y divide-subtle">
          {rules.map(rule => {
            const evColor = EVENT_COLORS[rule.event_type] || EVENT_COLORS.model_fallback;
            const chColor = CHANNEL_COLORS[rule.channel] || CHANNEL_COLORS.telegram;
            const evLabel = eventTypes.find(e => e.value === rule.event_type)?.label || rule.event_type;
            return (
              <div key={rule.id} data-testid={`rule-row-${rule.id}`} className={`px-5 py-4 hover:bg-muted/30 transition-colors ${!rule.enabled ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${evColor.bg} ${evColor.border}`}>
                      <Bell className={`w-4 h-4 ${evColor.text}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${evColor.bg} ${evColor.border} ${evColor.text}`}>
                          {evLabel}
                        </span>
                        <span className="text-theme-dimmed text-xs">→</span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${chColor.bg} ${chColor.border} ${chColor.text}`}>
                          <MessageSquare className="w-3 h-3" />
                          {rule.channel}
                        </span>
                        <span className="text-sm font-medium text-theme-primary">{rule.target_name || rule.target}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-[11px] text-theme-faint">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Cooldown: {rule.cooldown_minutes}m
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Send className="w-3 h-3" />
                          Last sent: {formatAge(rule.last_notified_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => handleToggle(rule)}
                      className="data-[state=checked]:bg-orange-500"
                    />
                    <Button variant="ghost" size="sm" onClick={() => openEdit(rule)} className="text-theme-faint hover:text-orange-500 hover:bg-orange-500/10">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(rule)} className="text-theme-faint hover:text-red-500 hover:bg-red-500/10">
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
              {editing ? 'Edit Rule' : 'New Notification Rule'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Event Type */}
            <div>
              <Label className="text-theme-muted text-xs">Event Type</Label>
              <Select value={form.event_type} onValueChange={v => setForm({ ...form, event_type: v })}>
                <SelectTrigger className="bg-surface-sunken border-subtle text-sm mt-1">
                  <SelectValue placeholder="Select event..." />
                </SelectTrigger>
                <SelectContent className="bg-surface-card border-subtle">
                  {eventTypes.map(e => (
                    <SelectItem key={e.value} value={e.value}>
                      <span className="flex flex-col">
                        <span>{e.label}</span>
                        <span className="text-[10px] text-theme-dimmed">{e.description}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Group */}
            <div>
              <Label className="text-theme-muted text-xs">Target Group</Label>
              {groups.length > 0 ? (
                <Select value={form.target} onValueChange={onGroupChange}>
                  <SelectTrigger className="bg-surface-sunken border-subtle text-sm mt-1">
                    <SelectValue placeholder="Select a group..." />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-card border-subtle max-h-60">
                    {groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>
                        <span className="flex items-center gap-2">
                          <span>{g.name}</span>
                          <span className="text-[10px] font-mono text-theme-dimmed uppercase">{g.platform}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Telegram chat ID (e.g. -100...)"
                  value={form.target}
                  onChange={e => setForm({ ...form, target: e.target.value, target_name: '' })}
                  className="bg-surface-sunken border-subtle text-sm mt-1"
                />
              )}
            </div>

            {/* Cooldown */}
            <div>
              <Label className="text-theme-muted text-xs">Cooldown (minutes)</Label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={form.cooldown_minutes}
                onChange={e => setForm({ ...form, cooldown_minutes: parseInt(e.target.value) || 30 })}
                className="bg-surface-sunken border-subtle text-sm mt-1 w-32"
              />
              <p className="text-[10px] text-theme-dimmed mt-1">Minimum time between repeat notifications</p>
            </div>

            {/* Enabled */}
            <div className="flex items-center justify-between">
              <Label className="text-theme-muted text-xs">Enabled</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={v => setForm({ ...form, enabled: v })}
                className="data-[state=checked]:bg-orange-500"
              />
            </div>

            {/* Test Button */}
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={!form.target || testing}
              className="w-full border-strong text-theme-muted hover:bg-muted"
            >
              <Send className="w-4 h-4 mr-2" />
              {testing ? 'Sending...' : 'Send Test Notification'}
            </Button>
          </div>

          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-subtle">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-strong text-theme-muted">
              Cancel
            </Button>
            <Button data-testid="save-rule-btn" onClick={handleSave} className="bg-orange-600 hover:bg-orange-700 text-white">
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
