import React, { useEffect, useState } from 'react';
import { getDashboard, seedData } from '../lib/api';
import { Activity, Bot, Zap, Radio, MessageSquare, Cpu, Clock, Server } from 'lucide-react';
import { toast } from 'sonner';

function StatCard({ icon: Icon, label, value, sub, color = 'orange' }) {
  const colors = {
    orange: 'text-orange-500 bg-orange-500/10 border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.15)]',
    blue: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
    green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    purple: 'text-violet-500 bg-violet-500/10 border-violet-500/20',
  };
  return (
    <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-5 hover:border-orange-500/20 transition-all duration-300 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        {sub && <span className="text-xs font-mono text-zinc-600">{sub}</span>}
      </div>
      <p className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      // Seed data first if empty
      await seedData();
      const res = await getDashboard();
      setData(res.data);
    } catch (e) {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div data-testid="dashboard-page" className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Dashboard
        </h1>
        <p className="text-sm text-zinc-500 mt-1">OpenClaw Gateway Management System</p>
      </div>

      {/* Gateway Status Banner */}
      <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg p-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse-glow" style={{ boxShadow: '0 0 12px rgba(16,185,129,0.6)' }} />
          <div>
            <p className="text-sm font-medium text-zinc-200">Gateway Status</p>
            <p className="text-xs font-mono text-zinc-500">{data?.gateway_status === 'running' ? 'OPERATIONAL' : 'OFFLINE'} · Port 18789</p>
          </div>
        </div>
        <span className="text-xs font-mono px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-wider">
          {data?.gateway_status || 'unknown'}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Bot} label="Agents" value={data?.agents || 0} color="orange" />
        <StatCard icon={Zap} label="Skills" value={data?.skills?.total || 0} sub={`${data?.skills?.active || 0} active`} color="blue" />
        <StatCard icon={Radio} label="Channels" value={data?.channels?.total || 0} sub={`${data?.channels?.active || 0} active`} color="green" />
        <StatCard icon={MessageSquare} label="Sessions" value={data?.sessions || 0} color="purple" />
        <StatCard icon={Cpu} label="Model Providers" value={data?.model_providers || 0} color="blue" />
        <StatCard icon={Clock} label="Cron Jobs" value={data?.cron_jobs || 0} color="green" />
        <StatCard icon={Server} label="Gateway" value="Running" color="orange" />
        <StatCard icon={Activity} label="Recent Events" value={data?.recent_activity?.length || 0} color="purple" />
      </div>

      {/* Recent Activity */}
      <div className="bg-[#0c0c0e] border border-zinc-800/60 rounded-lg">
        <div className="border-b border-zinc-800/60 p-4 bg-[#101012] rounded-t-lg">
          <h2 className="text-base font-semibold" style={{ fontFamily: 'Manrope, sans-serif' }}>Recent Activity</h2>
        </div>
        <div className="divide-y divide-zinc-800/40">
          {data?.recent_activity?.length > 0 ? data.recent_activity.map((log, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono px-2 py-0.5 rounded uppercase tracking-wider ${
                  log.action === 'create' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                  log.action === 'delete' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                  log.action === 'update' ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20' :
                  'bg-zinc-800 text-zinc-500 border border-zinc-700'
                }`}>{log.action}</span>
                <span className="text-sm text-zinc-300">{log.details || `${log.action} ${log.entity_type}`}</span>
              </div>
              <span className="text-xs font-mono text-zinc-600">
                {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
              </span>
            </div>
          )) : (
            <div className="px-4 py-8 text-center text-sm text-zinc-600">No recent activity</div>
          )}
        </div>
      </div>
    </div>
  );
}
