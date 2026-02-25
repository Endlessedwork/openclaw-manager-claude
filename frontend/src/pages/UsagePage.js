import React, { useEffect, useState, useCallback } from 'react';
import { getUsageCost, getUsageBreakdown } from '../lib/api';
import { Coins, TrendingUp, Zap, Bot, BarChart3, PieChart as PieIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const PERIOD_OPTIONS = [
  { label: 'Today', value: 1 },
  { label: '7d', value: 7 },
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
];

const CHANNEL_COLORS = {
  telegram: '#38bdf8',
  discord: '#818cf8',
  line: '#34d399',
  whatsapp: '#22c55e',
  webchat: '#f97316',
};

const CHART_COLORS = ['#f97316', '#0ea5e9', '#8b5cf6', '#22c55e', '#f43f5e', '#eab308', '#ec4899'];

function formatTokens(n) {
  if (n == null) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(n) {
  if (n == null) return '$0.00';
  return `$${n.toFixed(2)}`;
}

function StatCard({ icon: Icon, label, value, sub, color = 'orange' }) {
  const colors = {
    orange: 'text-orange-500 bg-orange-500/10 border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.15)]',
    blue: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
    green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    purple: 'text-violet-500 bg-violet-500/10 border-violet-500/20',
  };
  return (
    <div className="bg-surface-card border border-subtle rounded-lg p-5 hover:border-orange-500/20 transition-all duration-300 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        {sub && <span className="text-xs font-mono text-theme-dimmed">{sub}</span>}
      </div>
      <p className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</p>
      <p className="text-xs text-theme-faint mt-1">{label}</p>
    </div>
  );
}

function ChartCard({ title, icon: Icon, children }) {
  return (
    <div className="bg-surface-card border border-subtle rounded-lg animate-fade-in">
      <div className="border-b border-subtle p-4 bg-surface-header rounded-t-lg flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-theme-dimmed" />}
        <h2 className="text-sm font-semibold" style={{ fontFamily: 'Manrope, sans-serif' }}>{title}</h2>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a1f] border border-white/10 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-theme-faint mb-1 font-mono">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-theme-secondary">{entry.name}:</span>
          <span className="font-mono text-theme-primary">{formatter ? formatter(entry.value) : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function UsagePage() {
  const [costData, setCostData] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [customRange, setCustomRange] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [tempStart, setTempStart] = useState('');
  const [tempEnd, setTempEnd] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = customRange
        ? { start: customRange.start, end: customRange.end }
        : { days };
      const [costRes, breakdownRes] = await Promise.all([
        getUsageCost(params),
        getUsageBreakdown(params),
      ]);
      setCostData(costRes.data);
      setBreakdown(breakdownRes.data);
    } catch (e) {
      toast.error('Failed to load usage data');
    } finally {
      setLoading(false);
    }
  }, [days, customRange]);

  useEffect(() => { load(); }, [load]);

  const selectPreset = (d) => {
    setCustomRange(null);
    setShowCustom(false);
    setDays(d);
  };

  const applyCustomRange = () => {
    if (tempStart && tempEnd && tempStart <= tempEnd) {
      setCustomRange({ start: tempStart, end: tempEnd });
      setDays(null);
      setShowCustom(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totals = costData?.totals || {};
  const daily = (costData?.daily || []).map(d => ({
    ...d,
    date: d.date?.slice(5), // "02-20" format
  }));
  const dailyAvgCost = daily.length ? totals.totalCost / daily.length : 0;
  const topAgent = breakdown?.by_agent?.[0];

  // Prepare chart data
  const agentData = (breakdown?.by_agent || []).map(a => ({
    name: a._id || 'unknown',
    tokens: (a.tokens_in || 0) + (a.tokens_out || 0),
    requests: a.count || 0,
  }));

  const channelData = (breakdown?.by_channel || []).filter(c => c._id).map(c => ({
    name: c._id,
    value: (c.tokens_in || 0) + (c.tokens_out || 0),
    count: c.count || 0,
  }));

  return (
    <div data-testid="usage-page" className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Usage
          </h1>
          <p className="text-sm text-theme-faint mt-1">Token consumption & cost analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-surface-card border border-subtle rounded-lg p-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => selectPreset(opt.value)}
                className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
                  days === opt.value && !customRange
                    ? 'bg-orange-500/20 text-orange-500 border border-orange-500/30'
                    : 'text-theme-dimmed hover:text-theme-secondary'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustom(!showCustom)}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
                customRange
                  ? 'bg-orange-500/20 text-orange-500 border border-orange-500/30'
                  : 'text-theme-dimmed hover:text-theme-secondary'
              }`}
            >
              Custom
            </button>
          </div>
          {showCustom && (
            <div className="flex items-center gap-2 bg-surface-card border border-subtle rounded-lg p-2">
              <input
                type="date"
                value={tempStart}
                onChange={(e) => setTempStart(e.target.value)}
                className="bg-transparent border border-subtle rounded px-2 py-1 text-xs font-mono text-theme-secondary focus:border-orange-500/50 outline-none"
              />
              <span className="text-theme-faint text-xs">to</span>
              <input
                type="date"
                value={tempEnd}
                onChange={(e) => setTempEnd(e.target.value)}
                className="bg-transparent border border-subtle rounded px-2 py-1 text-xs font-mono text-theme-secondary focus:border-orange-500/50 outline-none"
              />
              <button
                onClick={applyCustomRange}
                disabled={!tempStart || !tempEnd || tempStart > tempEnd}
                className="px-3 py-1 text-xs font-mono rounded bg-orange-500/20 text-orange-500 border border-orange-500/30 hover:bg-orange-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Zap}
          label="Total Tokens"
          value={formatTokens(totals.totalTokens)}
          sub={customRange ? `${customRange.start} – ${customRange.end}` : `${days}d`}
          color="orange"
        />
        <StatCard
          icon={Coins}
          label="Total Cost"
          value={formatCost(totals.totalCost)}
          sub={formatCost(dailyAvgCost) + '/day'}
          color="blue"
        />
        <StatCard
          icon={TrendingUp}
          label="Daily Average"
          value={formatTokens(daily.length ? totals.totalTokens / daily.length : 0)}
          sub="tokens/day"
          color="green"
        />
        <StatCard
          icon={Bot}
          label="Top Agent"
          value={topAgent?._id || 'N/A'}
          sub={topAgent ? formatTokens((topAgent.tokens_in || 0) + (topAgent.tokens_out || 0)) + ' tokens' : ''}
          color="purple"
        />
      </div>

      {/* Charts Row 1: Daily Trend (full width) */}
      <ChartCard title="Daily Token Usage" icon={TrendingUp}>
        {daily.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={daily} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradInput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCache" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatTokens} />
              <Tooltip content={<CustomTooltip formatter={formatTokens} />} />
              <Legend
                wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                iconType="circle"
                iconSize={8}
              />
              <Area type="monotone" dataKey="cacheRead" name="Cache Read" stroke="#8b5cf6" fill="url(#gradCache)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="output" name="Output" stroke="#f97316" fill="url(#gradOutput)" strokeWidth={2} />
              <Area type="monotone" dataKey="input" name="Input" stroke="#0ea5e9" fill="url(#gradInput)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-sm text-theme-dimmed">No data for this period</div>
        )}
      </ChartCard>

      {/* Charts Row 2: Agent Bar + Channel Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top Agents" icon={BarChart3}>
          {agentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={agentData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={formatTokens} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
                <Tooltip content={<CustomTooltip formatter={formatTokens} />} />
                <Bar dataKey="tokens" name="Tokens" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {agentData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-theme-dimmed">No agent data available</div>
          )}
        </ChartCard>

        <ChartCard title="By Channel" icon={PieIcon}>
          {channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={channelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                >
                  {channelData.map((entry, i) => (
                    <Cell key={i} fill={CHANNEL_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip formatter={formatTokens} />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span className="text-theme-secondary text-xs">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-theme-dimmed">No channel data available</div>
          )}
        </ChartCard>
      </div>

      {/* Daily Breakdown Table */}
      <div className="bg-surface-card border border-subtle rounded-lg animate-fade-in">
        <div className="border-b border-subtle p-4 bg-surface-header rounded-t-lg flex items-center gap-2">
          <Coins className="w-4 h-4 text-theme-dimmed" />
          <h2 className="text-sm font-semibold" style={{ fontFamily: 'Manrope, sans-serif' }}>Daily Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-subtle text-theme-faint">
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Input</th>
                <th className="text-right px-4 py-3 font-medium">Output</th>
                <th className="text-right px-4 py-3 font-medium">Cache Read</th>
                <th className="text-right px-4 py-3 font-medium">Cache Write</th>
                <th className="text-right px-4 py-3 font-medium">Total Tokens</th>
                <th className="text-right px-4 py-3 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {daily.length > 0 ? [...daily].reverse().map((d, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-theme-secondary">{d.date}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sky-400">{formatTokens(d.input)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-orange-400">{formatTokens(d.output)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-violet-400">{formatTokens(d.cacheRead)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-amber-400">{formatTokens(d.cacheWrite)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-theme-primary font-medium">{formatTokens(d.totalTokens)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-400">{formatCost(d.totalCost)}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-theme-dimmed">No data for this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
