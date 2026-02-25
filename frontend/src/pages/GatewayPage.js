import React, { useEffect, useState } from 'react';
import { getGatewayStatus, restartGateway, getLogs } from '../lib/api';
import { RefreshCw, Activity, RotateCcw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useGatewayBanner } from '../contexts/GatewayBannerContext';

export default function GatewayPage() {
  const { isAdmin } = useAuth();
  const { handleRestart: bannerRestart } = useGatewayBanner();
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);

  const load = async () => {
    try {
      const [sRes, lRes] = await Promise.all([getGatewayStatus(), getLogs(100)]);
      setStatus(sRes.data);
      setLogs(lRes.data);
    } catch { toast.error('Failed to load gateway status'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await bannerRestart();
      load();
    } catch {
      toast.error('Failed to restart');
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div data-testid="gateway-page" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Gateway</h1>
          <p className="text-sm text-theme-faint mt-1">Monitor and control the gateway</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} className="border-strong text-theme-muted hover:bg-muted">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          {isAdmin() && (
            <Button data-testid="restart-gateway-btn" onClick={handleRestart} disabled={restarting} className="bg-red-600 hover:bg-red-700 text-white">
              <RotateCcw className="w-4 h-4 mr-2" /> {restarting ? 'Restarting...' : 'Restart Gateway'}
            </Button>
          )}
        </div>
      </div>

      {/* Status Cards */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-card border border-subtle rounded-lg p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 12px rgba(16,185,129,0.6)' }} />
              <span className="text-xs text-theme-faint uppercase tracking-wider font-mono">Status</span>
            </div>
            <p className="text-xl font-bold text-emerald-500 uppercase" style={{ fontFamily: 'Manrope, sans-serif' }}>{status.status}</p>
          </div>
          <div className="bg-surface-card border border-subtle rounded-lg p-5">
            <span className="text-xs text-theme-faint uppercase tracking-wider font-mono">Port</span>
            <p className="text-xl font-mono text-theme-primary mt-1">{status.port}</p>
          </div>
          <div className="bg-surface-card border border-subtle rounded-lg p-5">
            <span className="text-xs text-theme-faint uppercase tracking-wider font-mono">Bind Host</span>
            <p className="text-xl font-mono text-theme-primary mt-1">{status.bind_host}</p>
          </div>
          <div className="bg-surface-card border border-subtle rounded-lg p-5">
            <span className="text-xs text-theme-faint uppercase tracking-wider font-mono">Reload Mode</span>
            <p className="text-xl font-mono text-theme-primary mt-1">{status.reload_mode}</p>
          </div>
        </div>
      )}

      {/* Activity Logs */}
      <div className="bg-surface-card border border-subtle rounded-lg">
        <div className="border-b border-subtle p-4 bg-surface-header rounded-t-lg flex items-center gap-2">
          <Activity className="w-4 h-4 text-orange-500" />
          <h2 className="text-sm font-semibold" style={{ fontFamily: 'Manrope, sans-serif' }}>Activity Log</h2>
          <span className="text-xs font-mono text-theme-dimmed ml-auto">{logs.length} entries</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          <div className="divide-y divide-subtle">
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-theme-dimmed">No logs</div>
            ) : logs.map((log, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors font-mono text-xs">
                <span className="text-theme-dimmed w-20 shrink-0">
                  {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                </span>
                <span className={`px-1.5 py-0.5 rounded border uppercase tracking-wider w-16 text-center ${
                  log.action === 'create' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' :
                  log.action === 'delete' ? 'text-red-500 bg-red-500/10 border-red-500/20' :
                  log.action === 'update' ? 'text-sky-500 bg-sky-500/10 border-sky-500/20' :
                  log.action === 'restart' ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' :
                  'text-theme-faint bg-muted border-strong'
                }`}>{log.action}</span>
                <span className="text-theme-faint w-16 shrink-0">{log.entity_type}</span>
                <span className="text-theme-secondary flex-1 truncate">{log.details || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
