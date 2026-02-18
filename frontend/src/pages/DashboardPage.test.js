import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './DashboardPage';

// Mock sonner toast
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Activity: (props) => <svg data-testid="icon-activity" {...props} />,
  Bot: (props) => <svg data-testid="icon-bot" {...props} />,
  Zap: (props) => <svg data-testid="icon-zap" {...props} />,
  Radio: (props) => <svg data-testid="icon-radio" {...props} />,
  MessageSquare: (props) => <svg data-testid="icon-msg" {...props} />,
  Cpu: (props) => <svg data-testid="icon-cpu" {...props} />,
  Clock: (props) => <svg data-testid="icon-clock" {...props} />,
  Server: (props) => <svg data-testid="icon-server" {...props} />,
}));

const mockDashboardData = {
  agents: 3,
  skills: { total: 10, active: 7 },
  channels: { total: 5, active: 3 },
  sessions: 12,
  model_providers: 2,
  cron_jobs: 4,
  gateway_status: 'running',
  recent_activity: [
    { action: 'create', entity_type: 'agent', details: 'Created agent test-bot', timestamp: '2026-02-17T10:00:00Z' },
    { action: 'update', entity_type: 'skill', details: 'Updated web-search skill', timestamp: '2026-02-17T09:30:00Z' },
  ],
};

let mockGetDashboard;

jest.mock('../lib/api', () => ({
  getDashboard: (...args) => mockGetDashboard(...args),
}));

beforeEach(() => {
  mockGetDashboard = jest.fn().mockResolvedValue({ data: mockDashboardData });
});

describe('DashboardPage', () => {
  it('shows loading spinner initially', () => {
    // Make API never resolve to keep loading state
    mockGetDashboard.mockReturnValue(new Promise(() => {}));
    render(<DashboardPage />);
    expect(screen.queryByTestId('dashboard-page')).not.toBeInTheDocument();
    // Spinner should be visible (it's the animate-spin div)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders stat cards with API data', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    });

    // Verify stat values appear
    expect(screen.getByText('3')).toBeInTheDocument(); // agents
    expect(screen.getByText('10')).toBeInTheDocument(); // skills total
    expect(screen.getByText('7 active')).toBeInTheDocument(); // skills active
    expect(screen.getByText('5')).toBeInTheDocument(); // channels total
    expect(screen.getByText('12')).toBeInTheDocument(); // sessions
    expect(screen.getAllByText('2')).toHaveLength(2); // model providers + recent events
    expect(screen.getByText('4')).toBeInTheDocument(); // cron jobs
    expect(screen.getByText('Running')).toBeInTheDocument(); // gateway

    // Verify labels
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Channels')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  it('displays gateway status banner as OPERATIONAL', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Gateway Status')).toBeInTheDocument();
    });
    expect(screen.getByText(/OPERATIONAL/)).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('renders recent activity entries', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Created agent test-bot')).toBeInTheDocument();
    });
    expect(screen.getByText('Updated web-search skill')).toBeInTheDocument();
    expect(screen.getByText('create')).toBeInTheDocument();
    expect(screen.getByText('update')).toBeInTheDocument();
  });

  it('shows "No recent activity" when activity list is empty', async () => {
    mockGetDashboard.mockResolvedValue({
      data: { ...mockDashboardData, recent_activity: [] },
    });
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('No recent activity')).toBeInTheDocument();
    });
  });

  it('shows error toast when API fails', async () => {
    const { toast } = require('sonner');
    mockGetDashboard.mockRejectedValue(new Error('Network error'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load dashboard');
    });
  });

  it('calls getDashboard on mount', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    });
    expect(mockGetDashboard).toHaveBeenCalled();
  });
});
