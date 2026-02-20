import React, { useEffect, useState } from 'react';
import { getCronJobs } from '../lib/api';
import { Clock, Plus, Pencil, Trash2, Play, Pause } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';

const EMPTY_JOB = {
  name: '', schedule: '', agent_id: 'main', task: '', enabled: true,
  max_concurrent: 1, timeout_seconds: 300, status: 'idle',
};

export default function CronPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_JOB);

  const load = async () => {
    try { const res = await getCronJobs(); setJobs(res.data); }
    catch { toast.error('Failed to load cron jobs'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_JOB); setDialogOpen(true); };
  const openEdit = (j) => { setEditing(j); setForm({ ...j }); setDialogOpen(true); };

  const handleSave = async () => {
    try {
      if (editing) { await updateCronJob(editing.id, form); toast.success('Job updated'); }
      else { await createCronJob(form); toast.success('Job created'); }
      setDialogOpen(false); load();
    } catch { toast.error('Failed to save'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this cron job?')) return;
    try { await deleteCronJob(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed'); }
  };

  const handleToggle = async (job) => {
    try {
      await updateCronJob(job.id, { ...job, enabled: !job.enabled });
      toast.success(`Job ${job.enabled ? 'disabled' : 'enabled'}`); load();
    } catch { toast.error('Failed'); }
  };

  return (
    <div data-testid="cron-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Cron Jobs</h1>
          <p className="text-sm text-theme-faint mt-1">Schedule recurring agent tasks</p>
        </div>
        <Button data-testid="create-cron-btn" onClick={openCreate} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
          <Plus className="w-4 h-4 mr-2" /> New Job
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : jobs.length === 0 ? (
        <div className="bg-surface-card border border-subtle rounded-lg p-12 text-center">
          <Clock className="w-12 h-12 text-theme-dimmed mx-auto mb-3" /><p className="text-theme-faint">No cron jobs</p>
        </div>
      ) : (
        <div className="bg-surface-card border border-subtle rounded-lg divide-y divide-subtle">
          {jobs.map(job => (
            <div key={job.id} data-testid={`cron-row-${job.id}`} className="px-5 py-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${job.enabled ? 'bg-amber-500/10 border-amber-500/20' : 'bg-muted border-strong'}`}>
                    <Clock className={`w-4 h-4 ${job.enabled ? 'text-amber-500' : 'text-theme-dimmed'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-theme-primary">{job.name}</h3>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted border border-strong text-theme-muted">{job.schedule}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                        job.status === 'running' ? 'text-sky-500 bg-sky-500/10 border-sky-500/20' :
                        job.status === 'idle' ? 'text-theme-faint bg-muted border-strong' :
                        'text-red-500 bg-red-500/10 border-red-500/20'
                      }`}>{job.status}</span>
                    </div>
                    <p className="text-xs text-theme-faint mt-0.5 truncate">{job.task || 'No task description'}</p>
                    <div className="flex gap-4 text-[10px] text-theme-dimmed mt-1 font-mono">
                      <span>Agent: {job.agent_id}</span>
                      <span>Runs: {job.run_count}</span>
                      <span>Timeout: {job.timeout_seconds}s</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Switch checked={job.enabled} onCheckedChange={() => handleToggle(job)} />
                  <Button variant="ghost" size="sm" onClick={() => openEdit(job)} className="text-theme-faint hover:text-orange-500 hover:bg-orange-500/10">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(job.id)} className="text-theme-faint hover:text-red-500 hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-surface-card border-subtle max-w-lg">
          <DialogHeader><DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>{editing ? 'Edit Cron Job' : 'New Cron Job'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label className="text-theme-muted text-xs">Job Name</Label><Input data-testid="cron-name-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="bg-surface-sunken border-subtle focus:border-orange-500 text-sm mt-1" /></div>
            <div><Label className="text-theme-muted text-xs">Schedule (cron syntax)</Label><Input value={form.schedule} onChange={e => setForm({...form, schedule: e.target.value})} className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" placeholder="*/15 * * * *" /></div>
            <div><Label className="text-theme-muted text-xs">Agent ID</Label><Input value={form.agent_id} onChange={e => setForm({...form, agent_id: e.target.value})} className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" /></div>
            <div><Label className="text-theme-muted text-xs">Task</Label><Textarea value={form.task} onChange={e => setForm({...form, task: e.target.value})} className="bg-surface-sunken border-subtle focus:border-orange-500 text-sm mt-1" rows={3} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-theme-muted text-xs">Max Concurrent</Label><Input type="number" value={form.max_concurrent} onChange={e => setForm({...form, max_concurrent: parseInt(e.target.value) || 1})} className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" /></div>
              <div><Label className="text-theme-muted text-xs">Timeout (seconds)</Label><Input type="number" value={form.timeout_seconds} onChange={e => setForm({...form, timeout_seconds: parseInt(e.target.value) || 300})} className="bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm mt-1" /></div>
            </div>
            <div className="flex items-center justify-between"><Label className="text-theme-muted text-xs">Enabled</Label><Switch checked={form.enabled} onCheckedChange={v => setForm({...form, enabled: v})} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-subtle">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-strong text-theme-muted">Cancel</Button>
            <Button data-testid="save-cron-btn" onClick={handleSave} className="bg-orange-600 hover:bg-orange-700 text-white">{editing ? 'Update' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
