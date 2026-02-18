import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import GatewayPage from './GatewayPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  RefreshCw: (props) => <svg data-testid="icon-refresh" {...props} />,
  Activity: (props) => <svg data-testid="icon-activity" {...props} />,
  RotateCcw: (props) => <svg data-testid="icon-rotate" {...props} />,
}));

const mockStatus = { status: 'running', port: 18789, bind_host: 'loopback', reload_mode: 'local', uptime_ms: 123456 };
const mockLogs = [
  { action: 'create', entity_type: 'provider', details: 'Created provider anthropic', timestamp: '2026-02-19T10:00:00Z' },
  { action: 'restart', entity_type: 'gateway', details: 'Gateway restart requested', timestamp: '2026-02-19T09:00:00Z' },
];

let mockGetGatewayStatus, mockRestartGateway, mockGetLogs;

jest.mock('../lib/api', () => ({
  getGatewayStatus: (...args) => mockGetGatewayStatus(...args),
  restartGateway: (...args) => mockRestartGateway(...args),
  getLogs: (...args) => mockGetLogs(...args),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: () => true }),
}));

jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => <button onClick={onClick} disabled={disabled} {...props}>{children}</button>,
}));

beforeEach(() => {
  mockGetGatewayStatus = jest.fn().mockResolvedValue({ data: mockStatus });
  mockRestartGateway = jest.fn().mockResolvedValue({ data: {} });
  mockGetLogs = jest.fn().mockResolvedValue({ data: mockLogs });
});

describe('GatewayPage', () => {
  it('renders gateway status after loading', async () => {
    render(<GatewayPage />);
    await waitFor(() => {
      expect(screen.getByText('running')).toBeInTheDocument();
    });
    expect(screen.getByText('18789')).toBeInTheDocument();
    expect(screen.getByText('loopback')).toBeInTheDocument();
    expect(screen.getByText('local')).toBeInTheDocument();
  });

  it('renders activity logs', async () => {
    render(<GatewayPage />);
    await waitFor(() => {
      expect(screen.getByText('Created provider anthropic')).toBeInTheDocument();
    });
    expect(screen.getByText('Gateway restart requested')).toBeInTheDocument();
    expect(screen.getByText('2 entries')).toBeInTheDocument();
  });

  it('shows empty logs state', async () => {
    mockGetLogs.mockResolvedValue({ data: [] });
    render(<GatewayPage />);
    await waitFor(() => {
      expect(screen.getByText('No logs')).toBeInTheDocument();
    });
  });

  it('shows restart button for admin', async () => {
    render(<GatewayPage />);
    await waitFor(() => {
      expect(screen.getByTestId('restart-gateway-btn')).toBeInTheDocument();
    });
  });

  it('calls restartGateway on restart click', async () => {
    render(<GatewayPage />);
    await waitFor(() => {
      expect(screen.getByTestId('restart-gateway-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('restart-gateway-btn'));
    await waitFor(() => {
      expect(mockRestartGateway).toHaveBeenCalled();
    });
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetGatewayStatus.mockRejectedValue(new Error('fail'));
    render(<GatewayPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load gateway status');
    });
  });

  it('displays action type badges in logs', async () => {
    render(<GatewayPage />);
    await waitFor(() => {
      expect(screen.getByText('create')).toBeInTheDocument();
    });
    expect(screen.getByText('restart')).toBeInTheDocument();
  });

  it('renders page title', () => {
    render(<GatewayPage />);
    expect(screen.getByText('Gateway')).toBeInTheDocument();
  });
});
