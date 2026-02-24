import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import UsagePage from './UsagePage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Coins: (props) => <svg data-testid="icon-coins" {...props} />,
  TrendingUp: (props) => <svg data-testid="icon-trending" {...props} />,
  Zap: (props) => <svg data-testid="icon-zap" {...props} />,
  Bot: (props) => <svg data-testid="icon-bot" {...props} />,
  BarChart3: (props) => <svg data-testid="icon-bar" {...props} />,
  PieChart: (props) => <svg data-testid="icon-pie" {...props} />,
}));

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div />,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div />,
  Cell: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
}));

const mockCostData = {
  totals: { totalTokens: 1500000, totalCost: 12.50 },
  daily: [
    { date: '2026-02-21', input: 100000, output: 50000, cacheRead: 20000, cacheWrite: 5000, totalTokens: 175000, totalCost: 1.50 },
    { date: '2026-02-22', input: 200000, output: 80000, cacheRead: 30000, cacheWrite: 8000, totalTokens: 318000, totalCost: 2.80 },
    { date: '2026-02-23', input: 150000, output: 60000, cacheRead: 25000, cacheWrite: 6000, totalTokens: 241000, totalCost: 2.10 },
  ],
};

const mockBreakdownData = {
  by_agent: [
    { _id: 'main', tokens_in: 500000, tokens_out: 200000, count: 150 },
    { _id: 'helper', tokens_in: 300000, tokens_out: 100000, count: 80 },
  ],
  by_channel: [
    { _id: 'telegram', tokens_in: 400000, tokens_out: 150000, count: 120 },
    { _id: 'discord', tokens_in: 200000, tokens_out: 80000, count: 60 },
  ],
};

let mockGetUsageCost, mockGetUsageBreakdown;

jest.mock('../lib/api', () => ({
  getUsageCost: (...args) => mockGetUsageCost(...args),
  getUsageBreakdown: (...args) => mockGetUsageBreakdown(...args),
}));

beforeEach(() => {
  mockGetUsageCost = jest.fn().mockResolvedValue({ data: mockCostData });
  mockGetUsageBreakdown = jest.fn().mockResolvedValue({ data: mockBreakdownData });
});

describe('UsagePage', () => {
  it('renders usage page after loading', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByTestId('usage-page')).toBeInTheDocument();
    });
    expect(screen.getByText('Usage')).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockGetUsageCost.mockReturnValue(new Promise(() => {}));
    mockGetUsageBreakdown.mockReturnValue(new Promise(() => {}));
    render(<UsagePage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('displays stat cards with correct values', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByText('1.5M')).toBeInTheDocument();
    });
    expect(screen.getByText('$12.50')).toBeInTheDocument();
    expect(screen.getAllByText('Total Tokens').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Total Cost').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Daily Average')).toBeInTheDocument();
    expect(screen.getByText('Top Agent')).toBeInTheDocument();
  });

  it('shows top agent name', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument();
    });
  });

  it('renders all period buttons including Today', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByTestId('usage-page')).toBeInTheDocument();
    });
    const buttons = screen.getByTestId('usage-page').querySelectorAll('button');
    const labels = Array.from(buttons).map(b => b.textContent);
    expect(labels).toContain('Today');
    expect(labels).toContain('7d');
    expect(labels).toContain('14d');
    expect(labels).toContain('30d');
    expect(labels).toContain('60d');
  });

  it('defaults to 30d period', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByTestId('usage-page')).toBeInTheDocument();
    });
    expect(mockGetUsageCost).toHaveBeenCalledWith({ days: 30 });
    expect(mockGetUsageBreakdown).toHaveBeenCalledWith({ days: 30 });
  });

  it('switches to Today period and fetches days=1', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByTestId('usage-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Today'));
    await waitFor(() => {
      expect(mockGetUsageCost).toHaveBeenCalledWith({ days: 1 });
      expect(mockGetUsageBreakdown).toHaveBeenCalledWith({ days: 1 });
    });
  });

  it('switches to 7d period', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByTestId('usage-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('7d'));
    await waitFor(() => {
      expect(mockGetUsageCost).toHaveBeenCalledWith({ days: 7 });
    });
  });

  it('renders chart sections', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByText('Daily Token Usage')).toBeInTheDocument();
    });
    expect(screen.getByText('Top Agents')).toBeInTheDocument();
    expect(screen.getByText('By Channel')).toBeInTheDocument();
  });

  it('renders daily breakdown table with data', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByText('Daily Breakdown')).toBeInTheDocument();
    });
    // Table headers
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.getByText('Cache Read')).toBeInTheDocument();
    expect(screen.getByText('Cache Write')).toBeInTheDocument();
    // Daily rows should have formatted dates (MM-DD)
    expect(screen.getByText('02-21')).toBeInTheDocument();
    expect(screen.getByText('02-22')).toBeInTheDocument();
    expect(screen.getByText('02-23')).toBeInTheDocument();
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetUsageCost.mockRejectedValue(new Error('fail'));
    render(<UsagePage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load usage data');
    });
  });

  it('shows empty states when no data', async () => {
    mockGetUsageCost.mockResolvedValue({
      data: { totals: {}, daily: [] },
    });
    mockGetUsageBreakdown.mockResolvedValue({
      data: { by_agent: [], by_channel: [] },
    });
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getAllByText('No data for this period').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows N/A when no top agent', async () => {
    mockGetUsageBreakdown.mockResolvedValue({
      data: { by_agent: [], by_channel: [] },
    });
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });
  });

  it('renders Custom button in period selector', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByTestId('usage-page')).toBeInTheDocument();
    });
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('shows date inputs when Custom is clicked', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByTestId('usage-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Custom'));
    expect(screen.getByText('to')).toBeInTheDocument();
    expect(screen.getByText('Apply')).toBeInTheDocument();
  });

  it('highlights the active period button', async () => {
    render(<UsagePage />);
    await waitFor(() => {
      expect(screen.getByTestId('usage-page')).toBeInTheDocument();
    });
    const getButtons = () => {
      const buttons = screen.getByTestId('usage-page').querySelectorAll('button');
      return Array.from(buttons);
    };
    // 30d should be active by default
    const btn30 = getButtons().find(b => b.textContent === '30d');
    expect(btn30.className).toContain('bg-orange-500/20');

    // Switch to Today
    const todayBtn = getButtons().find(b => b.textContent === 'Today');
    fireEvent.click(todayBtn);
    await waitFor(() => {
      const updatedToday = getButtons().find(b => b.textContent === 'Today');
      expect(updatedToday.className).toContain('bg-orange-500/20');
    });
    // 30d should no longer be active
    const updated30 = getButtons().find(b => b.textContent === '30d');
    expect(updated30.className).not.toContain('bg-orange-500/20');
  });
});
