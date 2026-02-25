import React, { useEffect, useState, useCallback } from 'react';
import { getSystemHealth } from '../lib/api';
import {
  Cpu, HardDrive, Network, Activity, ArrowUp, ArrowDown,
  Clock, Thermometer, Server
} from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (bytes === 0 || bytes == null) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i >= 3 ? 1 : 0)} ${sizes[i]}`;
}

function formatUptime(seconds) {
  if (!seconds) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getUsageColor(percent) {
  if (percent >= 90) return { text: 'text-red-500', stroke: '#ef4444', bg: 'bg-red-500', glow: 'rgba(239,68,68,0.4)' };
  if (percent >= 75) return { text: 'text-orange-500', stroke: '#f97316', bg: 'bg-orange-500', glow: 'rgba(249,115,22,0.4)' };
  if (percent >= 50) return { text: 'text-amber-500', stroke: '#f59e0b', bg: 'bg-amber-500', glow: 'rgba(245,158,11,0.3)' };
  return { text: 'text-emerald-500', stroke: '#10b981', bg: 'bg-emerald-500', glow: 'rgba(16,185,129,0.3)' };
}

function getBarGradient(percent) {
  if (percent >= 90) return 'from-red-600 to-red-400';
  if (percent >= 75) return 'from-orange-600 to-orange-400';
  if (percent >= 50) return 'from-amber-600 to-amber-400';
  return 'from-emerald-600 to-emerald-400';
}

// ---------------------------------------------------------------------------
// Circular Gauge Component
// ---------------------------------------------------------------------------

function CircularGauge({ percent = 0, size = 'md', label, sublabel }) {
  const sizes = { sm: 60, md: 80, lg: 120 };
  const dim = sizes[size] || sizes.md;
  const strokeWidth = size === 'lg' ? 6 : size === 'sm' ? 3 : 4;
  const radius = (dim - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
  const color = getUsageColor(percent);
  const center = dim / 2;
  const fontSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-xs' : 'text-base';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} className="transform -rotate-90">
          {/* Background arc */}
          <circle
            cx={center} cy={center} r={radius}
            stroke="#27272a" strokeWidth={strokeWidth}
            fill="none" strokeLinecap="round"
          />
          {/* Value arc */}
          <circle
            cx={center} cy={center} r={radius}
            stroke={color.stroke} strokeWidth={strokeWidth}
            fill="none" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease',
              filter: `drop-shadow(0 0 6px ${color.glow})`,
            }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`${fontSize} font-bold ${color.text}`}
            style={{ fontFamily: 'JetBrains Mono, monospace', transition: 'color 0.5s ease' }}
          >
            {Math.round(percent)}
          </span>
        </div>
      </div>
      {label && (
        <span className="text-xs text-theme-faint font-medium text-center leading-tight">{label}</span>
      )}
      {sublabel && (
        <span className="text-[10px] text-theme-dimmed font-mono text-center">{sublabel}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({ icon: Icon, title, children, className = '' }) {
  return (
    <div className={`bg-surface-card border border-subtle rounded-lg overflow-hidden hover:border-orange-500/20 transition-all duration-300 ${className}`}>
      <div className="border-b border-subtle px-5 py-3.5 bg-surface-header flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-orange-500" />
        <h2 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Manrope, sans-serif' }}>{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage Bar
// ---------------------------------------------------------------------------

function UsageBar({ percent, height = 'h-2', showLabel = false, label = '' }) {
  const gradient = getBarGradient(percent);
  const color = getUsageColor(percent);
  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-theme-faint">{label}</span>
          <span className={`text-xs font-mono font-medium ${color.text}`}>{percent.toFixed(1)}%</span>
        </div>
      )}
      <div className={`w-full ${height} bg-muted/80 rounded-full overflow-hidden`}>
        <div
          className={`${height} bg-gradient-to-r ${gradient} rounded-full`}
          style={{
            width: `${Math.min(percent, 100)}%`,
            transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: `0 0 8px ${color.glow}`,
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini Stat Card (for Quick Stats Bar)
// ---------------------------------------------------------------------------

function MiniStat({ icon: Icon, label, value, sub, color = 'orange' }) {
  const colors = {
    orange: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
    blue: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
    green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    purple: 'text-violet-500 bg-violet-500/10 border-violet-500/20',
  };
  return (
    <div className="bg-surface-card border border-subtle rounded-lg p-4 hover:border-orange-500/20 transition-all duration-300">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center border ${colors[color]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs text-theme-faint">{label}</span>
      </div>
      <p className="text-lg font-bold tracking-tight" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{value}</p>
      {sub && <p className="text-[10px] text-theme-dimmed font-mono mt-0.5">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HealthPage
// ---------------------------------------------------------------------------

export default function HealthPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async (isInitial = false) => {
    try {
      const res = await getSystemHealth();
      setData(res.data);
      setLastUpdated(new Date());
    } catch {
      if (isInitial) toast.error('Failed to load system health');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const interval = setInterval(() => load(false), 3000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div data-testid="health-page" className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div data-testid="health-page" className="flex items-center justify-center h-64">
        <p className="text-sm text-theme-faint">Unable to load health data.</p>
      </div>
    );
  }

  const { cpu, memory, disk, network, processes, uptime_seconds, temperatures } = data;

  return (
    <div data-testid="health-page" className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            System Health
          </h1>
          <p className="text-sm text-theme-faint mt-1">Real-time infrastructure monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[11px] font-mono text-theme-dimmed hidden sm:block">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1.5">
            <div
              className="w-2 h-2 rounded-full bg-emerald-500"
              style={{
                boxShadow: '0 0 8px rgba(16,185,129,0.6)',
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
            />
            <span className="text-xs font-medium text-emerald-500 tracking-wide">LIVE</span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Quick Stats Bar                                                  */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-surface-card border border-subtle rounded-lg p-4 hover:border-orange-500/20 transition-all duration-300 flex items-center gap-4">
          <CircularGauge percent={cpu?.percent_total || 0} size="sm" />
          <div>
            <p className="text-xs text-theme-faint">CPU</p>
            <p className="text-sm font-bold font-mono" style={{ transition: 'color 0.5s ease' }}>
              {(cpu?.percent_total || 0).toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="bg-surface-card border border-subtle rounded-lg p-4 hover:border-orange-500/20 transition-all duration-300 flex items-center gap-4">
          <CircularGauge percent={memory?.percent || 0} size="sm" />
          <div>
            <p className="text-xs text-theme-faint">Memory</p>
            <p className="text-sm font-bold font-mono">
              {(memory?.percent || 0).toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="bg-surface-card border border-subtle rounded-lg p-4 hover:border-orange-500/20 transition-all duration-300 flex items-center gap-4">
          <CircularGauge percent={disk?.partitions?.[0]?.percent || 0} size="sm" />
          <div>
            <p className="text-xs text-theme-faint">Disk</p>
            <p className="text-sm font-bold font-mono">
              {(disk?.partitions?.[0]?.percent || 0).toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="bg-surface-card border border-subtle rounded-lg p-4 hover:border-orange-500/20 transition-all duration-300">
          <div className="flex items-center gap-2 mb-1.5">
            <Network className="w-3.5 h-3.5 text-sky-500" />
            <span className="text-xs text-theme-faint">Network</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <ArrowUp className="w-3 h-3 text-emerald-500" />
            <span className="text-theme-secondary">{formatBytes(network?.bytes_sent)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono mt-0.5">
            <ArrowDown className="w-3 h-3 text-sky-500" />
            <span className="text-theme-secondary">{formatBytes(network?.bytes_recv)}</span>
          </div>
        </div>
        <MiniStat
          icon={Clock}
          label="Uptime"
          value={formatUptime(uptime_seconds)}
          color="green"
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* CPU Section                                                      */}
      {/* ---------------------------------------------------------------- */}
      <Section icon={Cpu} title="CPU">
        <div className="space-y-5">
          {/* Total CPU */}
          <div>
            <UsageBar percent={cpu?.percent_total || 0} height="h-3" showLabel label="Total CPU" />
          </div>

          {/* Per-core breakdown */}
          {cpu?.percent_per_core?.length > 1 && (
            <div>
              <p className="text-xs text-theme-faint mb-3">Per-Core Usage</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {cpu.percent_per_core.map((pct, i) => (
                  <UsageBar key={i} percent={pct} height="h-1.5" showLabel label={`Core ${i}`} />
                ))}
              </div>
            </div>
          )}

          {/* Load average + frequency */}
          <div className="flex flex-wrap gap-6 pt-2 border-t border-subtle">
            {cpu?.load_avg && (
              <div>
                <p className="text-xs text-theme-faint mb-1">Load Average</p>
                <div className="flex items-center gap-3">
                  {['1m', '5m', '15m'].map((label, i) => (
                    <div key={label} className="text-center">
                      <p className="text-sm font-bold font-mono text-theme-primary">
                        {cpu.load_avg[i]?.toFixed(2) ?? '--'}
                      </p>
                      <p className="text-[10px] text-theme-dimmed font-mono">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs text-theme-faint mb-1">Cores</p>
              <p className="text-sm font-mono text-theme-primary">
                {cpu?.count_physical || '--'}P / {cpu?.count_logical || '--'}L
              </p>
            </div>
            {cpu?.frequency_mhz?.current > 0 && (
              <div>
                <p className="text-xs text-theme-faint mb-1">Frequency</p>
                <p className="text-sm font-mono text-theme-primary">
                  {(cpu.frequency_mhz.current / 1000).toFixed(2)} GHz
                </p>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Memory Section                                                   */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section icon={Server} title="RAM">
          <div className="flex items-center gap-6">
            <CircularGauge
              percent={memory?.percent || 0}
              size="lg"
              label="Used"
              sublabel={`${formatBytes(memory?.used_bytes)} / ${formatBytes(memory?.total_bytes)}`}
            />
            <div className="flex-1 space-y-3">
              <UsageBar percent={memory?.percent || 0} height="h-2" showLabel label="Usage" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-theme-dimmed uppercase tracking-wider">Used</p>
                  <p className="text-sm font-mono text-theme-primary">{formatBytes(memory?.used_bytes)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-theme-dimmed uppercase tracking-wider">Available</p>
                  <p className="text-sm font-mono text-theme-primary">{formatBytes(memory?.available_bytes)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-theme-dimmed uppercase tracking-wider">Total</p>
                  <p className="text-sm font-mono text-theme-primary">{formatBytes(memory?.total_bytes)}</p>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section icon={Server} title="Swap">
          <div className="flex items-center gap-6">
            <CircularGauge
              percent={memory?.swap_percent || 0}
              size="lg"
              label="Used"
              sublabel={`${formatBytes(memory?.swap_used_bytes)} / ${formatBytes(memory?.swap_total_bytes)}`}
            />
            <div className="flex-1 space-y-3">
              <UsageBar percent={memory?.swap_percent || 0} height="h-2" showLabel label="Usage" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-theme-dimmed uppercase tracking-wider">Used</p>
                  <p className="text-sm font-mono text-theme-primary">{formatBytes(memory?.swap_used_bytes)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-theme-dimmed uppercase tracking-wider">Total</p>
                  <p className="text-sm font-mono text-theme-primary">{formatBytes(memory?.swap_total_bytes)}</p>
                </div>
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Disk Section                                                     */}
      {/* ---------------------------------------------------------------- */}
      <Section icon={HardDrive} title="Disk Partitions">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {disk?.partitions?.map((part, i) => {
            const color = getUsageColor(part.percent);
            return (
              <div
                key={i}
                className="bg-surface-page border border-subtle rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className={`w-3.5 h-3.5 ${color.text}`} />
                    <span className="text-sm font-mono text-theme-primary">{part.mountpoint}</span>
                  </div>
                  <span className={`text-xs font-mono font-bold ${color.text}`}>
                    {part.percent.toFixed(1)}%
                  </span>
                </div>
                <UsageBar percent={part.percent} height="h-2" />
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                  <div>
                    <p className="text-theme-dimmed uppercase tracking-wider">Used</p>
                    <p className="text-theme-secondary">{formatBytes(part.used_bytes)}</p>
                  </div>
                  <div>
                    <p className="text-theme-dimmed uppercase tracking-wider">Free</p>
                    <p className="text-theme-secondary">{formatBytes(part.free_bytes)}</p>
                  </div>
                  <div>
                    <p className="text-theme-dimmed uppercase tracking-wider">Total</p>
                    <p className="text-theme-secondary">{formatBytes(part.total_bytes)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-theme-dimmed font-mono pt-1 border-t border-subtle">
                  <span>{part.device}</span>
                  <span className="text-theme-dimmed">|</span>
                  <span>{part.fstype}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Network Section                                                  */}
      {/* ---------------------------------------------------------------- */}
      <Section icon={Network} title="Network">
        <div className="space-y-4">
          {/* Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUp className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] text-theme-dimmed uppercase tracking-wider">Sent</span>
              </div>
              <p className="text-sm font-mono text-theme-primary">{formatBytes(network?.bytes_sent)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowDown className="w-3 h-3 text-sky-500" />
                <span className="text-[10px] text-theme-dimmed uppercase tracking-wider">Received</span>
              </div>
              <p className="text-sm font-mono text-theme-primary">{formatBytes(network?.bytes_recv)}</p>
            </div>
            <div>
              <p className="text-[10px] text-theme-dimmed uppercase tracking-wider mb-1">Packets Sent</p>
              <p className="text-sm font-mono text-theme-primary">{(network?.packets_sent || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-theme-dimmed uppercase tracking-wider mb-1">Packets Recv</p>
              <p className="text-sm font-mono text-theme-primary">{(network?.packets_recv || 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Per-interface */}
          {network?.interfaces && Object.keys(network.interfaces).length > 0 && (
            <div className="border-t border-subtle pt-3">
              <p className="text-xs text-theme-faint mb-2">Interfaces</p>
              <div className="divide-y divide-subtle">
                {Object.entries(network.interfaces).map(([name, iface]) => (
                  <div key={name} className="flex items-center justify-between py-2">
                    <span className="text-xs font-mono text-theme-muted">{name}</span>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span className="flex items-center gap-1 text-emerald-500/80">
                        <ArrowUp className="w-3 h-3" /> {formatBytes(iface.bytes_sent)}
                      </span>
                      <span className="flex items-center gap-1 text-sky-500/80">
                        <ArrowDown className="w-3 h-3" /> {formatBytes(iface.bytes_recv)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Processes + Temperature row                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Processes */}
        <Section icon={Activity} title="Processes">
          <div className="flex items-center gap-6">
            {/* Segmented donut */}
            <div className="relative" style={{ width: 100, height: 100 }}>
              <svg width={100} height={100} className="transform -rotate-90">
                <circle cx={50} cy={50} r={40} stroke="#27272a" strokeWidth={8} fill="none" style={{ opacity: 0.3 }} />
                {(() => {
                  const total = processes?.total || 1;
                  const segments = [
                    { count: processes?.sleeping || 0, color: '#3b82f6' },
                    { count: processes?.running || 0, color: '#10b981' },
                    { count: processes?.zombie || 0, color: '#ef4444' },
                  ];
                  const radius = 40;
                  const circumference = 2 * Math.PI * radius;
                  let cumulativeOffset = 0;

                  return segments.map((seg, i) => {
                    const pct = seg.count / total;
                    const dashLength = pct * circumference;
                    const el = (
                      <circle
                        key={i}
                        cx={50} cy={50} r={radius}
                        stroke={seg.color}
                        strokeWidth={8}
                        fill="none"
                        strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                        strokeDashoffset={-cumulativeOffset}
                        style={{ transition: 'stroke-dasharray 0.8s ease, stroke-dashoffset 0.8s ease' }}
                      />
                    );
                    cumulativeOffset += dashLength;
                    return el;
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold font-mono text-theme-primary">{processes?.total || 0}</span>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-2.5">
              {[
                { label: 'Running', count: processes?.running || 0, color: 'bg-emerald-500' },
                { label: 'Sleeping', count: processes?.sleeping || 0, color: 'bg-blue-500' },
                { label: 'Zombie', count: processes?.zombie || 0, color: 'bg-red-500' },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                  <span className="text-xs text-theme-muted w-16">{label}</span>
                  <span className="text-xs font-mono text-theme-primary">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Temperature (conditional) */}
        {temperatures && (
          <Section icon={Thermometer} title="Temperature">
            <div className="space-y-2">
              {Object.entries(temperatures).map(([name, readings]) => (
                <div key={name}>
                  <p className="text-xs text-theme-faint mb-1">{name}</p>
                  {Array.isArray(readings) ? readings.map((r, i) => {
                    const temp = r?.current ?? r;
                    const tempColor = temp >= 80 ? 'text-red-500' : temp >= 60 ? 'text-amber-500' : 'text-emerald-500';
                    return (
                      <div key={i} className="flex items-center justify-between py-1">
                        <span className="text-xs font-mono text-theme-muted">{r?.label || `Sensor ${i}`}</span>
                        <span className={`text-sm font-mono font-bold ${tempColor}`}>{temp}°C</span>
                      </div>
                    );
                  }) : (
                    <p className="text-xs text-theme-dimmed">No readings available</p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* If no temperatures, show uptime detail instead */}
        {!temperatures && (
          <Section icon={Clock} title="System Info">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-theme-dimmed uppercase tracking-wider">Uptime</p>
                <p className="text-xl font-bold font-mono text-theme-primary mt-1">{formatUptime(uptime_seconds)}</p>
              </div>
              {data.boot_time && (
                <div>
                  <p className="text-[10px] text-theme-dimmed uppercase tracking-wider">Boot Time</p>
                  <p className="text-sm font-mono text-theme-muted mt-1">
                    {new Date(data.boot_time).toLocaleString()}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-theme-dimmed uppercase tracking-wider">Total Processes</p>
                <p className="text-sm font-mono text-theme-muted mt-1">{processes?.total || '--'}</p>
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
