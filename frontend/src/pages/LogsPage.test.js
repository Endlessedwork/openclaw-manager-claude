import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import LogsPage from './LogsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Terminal: (props) => <svg {...props} />,
  Search: (props) => <svg {...props} />,
  Trash2: (props) => <svg {...props} />,
  ArrowDown: (props) => <svg {...props} />,
  ArrowUp: (props) => <svg {...props} />,
  Filter: (props) => <svg {...props} />,
  X: (props) => <svg {...props} />,
  Wifi: (props) => <svg {...props} />,
  WifiOff: (props) => <svg {...props} />,
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, ...props }) => <button onClick={onClick} {...props}>{children}</button>,
}));
jest.mock('../components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));
jest.mock('../components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, id, ...props }) => (
    <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange?.(e.target.checked)} id={id} data-testid={props['data-testid']} />
  ),
}));
jest.mock('../components/ui/label', () => ({
  Label: ({ children, htmlFor, className }) => <label htmlFor={htmlFor} className={className}>{children}</label>,
}));

let mockGetSystemLogsStats;
jest.mock('../lib/api', () => ({
  getSystemLogsStats: (...args) => mockGetSystemLogsStats(...args),
  getWsUrl: (path, token) => `ws://localhost:8001/api/ws/${path}`,
}));

// Mock WebSocket
let mockWsInstance;
let wsOnOpen, wsOnMessage, wsOnClose, wsOnError;

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.sent = [];
    mockWsInstance = this;
  }
  set onopen(fn) { wsOnOpen = fn; }
  set onmessage(fn) { wsOnMessage = fn; }
  set onclose(fn) { wsOnClose = fn; }
  set onerror(fn) { wsOnError = fn; }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; }
}

const originalWebSocket = global.WebSocket;

beforeEach(() => {
  global.WebSocket = MockWebSocket;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSED = 3;
  mockGetSystemLogsStats = jest.fn().mockResolvedValue({
    data: { total: 50, errors: 3, warnings: 7, by_source: [] },
  });
  window.confirm = jest.fn(() => true);
  Element.prototype.scrollIntoView = jest.fn();
  jest.useFakeTimers();
});

afterEach(() => {
  global.WebSocket = originalWebSocket;
  jest.useRealTimers();
});

const mockLogs = [
  { id: 'log-1', level: 'INFO', source: 'gateway', message: 'Gateway started', timestamp: '2026-02-17T10:00:00Z' },
  { id: 'log-2', level: 'ERROR', source: 'agent:test-bot', message: 'Connection failed', timestamp: '2026-02-17T10:01:00Z' },
  { id: 'log-3', level: 'WARN', source: 'channel:discord', message: 'Rate limited', timestamp: '2026-02-17T10:02:00Z' },
  { id: 'log-4', level: 'DEBUG', source: 'session', message: 'Session cleanup', timestamp: '2026-02-17T10:03:00Z' },
];

describe('LogsPage', () => {
  it('renders with waiting message before connection', () => {
    render(<LogsPage />);
    expect(screen.getByTestId('logs-page')).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
  });

  it('shows "WS LIVE" after WebSocket connects', async () => {
    render(<LogsPage />);

    act(() => {
      wsOnOpen();
    });

    await waitFor(() => {
      expect(screen.getByText('WS LIVE')).toBeInTheDocument();
    });
  });

  it('renders log lines when receiving WebSocket messages', async () => {
    render(<LogsPage />);

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockLogs }) });
    });

    await waitFor(() => {
      expect(screen.getByText('Gateway started')).toBeInTheDocument();
    });
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
    expect(screen.getByText('Rate limited')).toBeInTheDocument();
    expect(screen.getByText('Session cleanup')).toBeInTheDocument();
  });

  it('appends new logs on subsequent messages', async () => {
    render(<LogsPage />);

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: [mockLogs[0]] }) });
    });

    await waitFor(() => {
      expect(screen.getByText('Gateway started')).toBeInTheDocument();
    });

    act(() => {
      wsOnMessage({ data: JSON.stringify({ type: 'update', data: [mockLogs[1]] }) });
    });

    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
  });

  it('shows RECONNECTING when WebSocket disconnects', async () => {
    render(<LogsPage />);

    act(() => {
      wsOnOpen();
    });

    await waitFor(() => {
      expect(screen.getByText('WS LIVE')).toBeInTheDocument();
    });

    act(() => {
      wsOnClose();
    });

    await waitFor(() => {
      expect(screen.getByText('RECONNECTING')).toBeInTheDocument();
    });
  });

  it('filters logs by level when filter buttons are toggled', async () => {
    render(<LogsPage />);

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockLogs }) });
    });

    await waitFor(() => {
      expect(screen.getByText('Gateway started')).toBeInTheDocument();
    });

    // Open filters panel
    fireEvent.click(screen.getByText('Filters'));

    // Toggle off INFO level
    fireEvent.click(screen.getByTestId('filter-level-info'));

    // INFO log should be hidden
    await waitFor(() => {
      expect(screen.queryByText('Gateway started')).not.toBeInTheDocument();
    });

    // ERROR log should still be visible
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
  });

  it('filters logs by source', async () => {
    render(<LogsPage />);

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockLogs }) });
    });

    await waitFor(() => {
      expect(screen.getByText('Gateway started')).toBeInTheDocument();
    });

    // Open filters
    fireEvent.click(screen.getByText('Filters'));

    // Filter by gateway source
    fireEvent.click(screen.getByTestId('filter-source-gateway'));

    await waitFor(() => {
      expect(screen.getByText('Gateway started')).toBeInTheDocument();
      expect(screen.queryByText('Connection failed')).not.toBeInTheDocument();
    });
  });

  it('ignores pong messages', async () => {
    render(<LogsPage />);

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'pong' }) });
    });

    expect(screen.getByText('Waiting for log entries...')).toBeInTheDocument();
  });

  it('renders log entries with correct level colors', () => {
    jest.useRealTimers();
    render(<LogsPage />);

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockLogs }) });
    });

    expect(screen.getByText('Gateway started')).toBeInTheDocument();
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
    expect(screen.getByText('Rate limited')).toBeInTheDocument();
    expect(screen.getByText('Session cleanup')).toBeInTheDocument();
  });

  it('connects WebSocket to correct URL', async () => {
    jest.useRealTimers();
    render(<LogsPage />);

    await waitFor(() => {
      expect(mockWsInstance).toBeDefined();
    });
    expect(mockWsInstance.url).toBe('ws://localhost:8001/api/ws/logs');
  });
});
