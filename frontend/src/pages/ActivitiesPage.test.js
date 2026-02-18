import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import ActivitiesPage from './ActivitiesPage';

// Mock sonner
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

// Mock lucide-react icons
jest.mock('lucide-react', () => {
  const icon = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return {
    Activity: icon('activity'), Bot: icon('bot'), Wrench: icon('wrench'),
    MessageSquare: icon('msg'), Cpu: icon('cpu'), Zap: icon('zap'),
    Clock: icon('clock'), ChevronDown: icon('chevron-down'), ChevronRight: icon('chevron-right'),
    RefreshCw: icon('refresh'), Trash2: icon('trash'), Play: icon('play'),
    Pause: icon('pause'), AlertTriangle: icon('alert'), CheckCircle: icon('check'),
    XCircle: icon('xcircle'), Loader: icon('loader'), Ban: icon('ban'),
    Terminal: icon('terminal'), Filter: icon('filter'), BarChart3: icon('barchart'),
    ArrowDown: icon('arrow-down'),
  };
});

// Mock UI components
jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, ...props }) => <button onClick={onClick} {...props}>{children}</button>,
}));
jest.mock('../components/ui/select', () => ({
  Select: ({ children, value, onValueChange }) => <div data-value={value}>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));
jest.mock('../components/ui/scroll-area', () => ({
  ScrollArea: ({ children }) => <div>{children}</div>,
}));
jest.mock('../components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, id, ...props }) => (
    <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange?.(e.target.checked)} id={id} data-testid={props['data-testid']} />
  ),
}));
jest.mock('../components/ui/label', () => ({
  Label: ({ children, htmlFor, className }) => <label htmlFor={htmlFor} className={className}>{children}</label>,
}));

// Mock API
let mockGetAgents, mockGetActivitiesStats, mockSimulateActivities, mockClearActivities;
jest.mock('../lib/api', () => ({
  getActivities: jest.fn().mockResolvedValue({ data: [] }),
  getActivitiesStats: (...args) => mockGetActivitiesStats(...args),
  simulateActivities: (...args) => mockSimulateActivities(...args),
  clearActivities: (...args) => mockClearActivities(...args),
  getAgents: (...args) => mockGetAgents(...args),
  getWsUrl: (path) => `ws://localhost:8001/api/ws/${path}`,
}));

// Mock WebSocket
let mockWsInstance;
let wsOnOpen, wsOnMessage, wsOnClose, wsOnError;

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1; // OPEN
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

const mockStats = {
  total: 25, running: 2, errors: 3,
  by_agent: [{ _id: 'agent-1', count: 15, errors: 1 }],
  by_tool: [{ _id: 'web-search', count: 8, avg_ms: 1200 }],
};

const mockAgentsList = [
  { id: 'agent-1', name: 'test-bot', status: 'active' },
  { id: 'agent-2', name: 'helper-agent', status: 'active' },
];

const mockActivities = [
  {
    id: 'act-1', event_type: 'tool_call', status: 'completed',
    agent_id: 'agent-1', agent_name: 'test-bot', tool_name: 'web-search',
    tool_input: 'search query', duration_ms: 1500, tokens_in: 100, tokens_out: 50,
    timestamp: new Date().toISOString(), verbose: 'Verbose output for act-1',
  },
  {
    id: 'act-2', event_type: 'llm_request', status: 'running',
    agent_id: 'agent-1', agent_name: 'test-bot', model_used: 'claude-sonnet-4-5',
    duration_ms: 3200, tokens_in: 500, tokens_out: 200,
    timestamp: new Date().toISOString(),
  },
  {
    id: 'act-3', event_type: 'message_received', status: 'error',
    agent_id: 'agent-2', agent_name: 'helper-agent', error: 'Connection timeout',
    timestamp: new Date().toISOString(),
  },
];

beforeEach(() => {
  global.WebSocket = MockWebSocket;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSED = 3;
  mockGetAgents = jest.fn().mockResolvedValue({ data: mockAgentsList });
  mockGetActivitiesStats = jest.fn().mockResolvedValue({ data: mockStats });
  mockSimulateActivities = jest.fn().mockResolvedValue({});
  mockClearActivities = jest.fn().mockResolvedValue({});
  window.confirm = jest.fn(() => true);
  Element.prototype.scrollIntoView = jest.fn();
  jest.useFakeTimers();
});

afterEach(() => {
  global.WebSocket = originalWebSocket;
  jest.useRealTimers();
});

describe('ActivitiesPage', () => {
  it('renders the page with header and controls', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });
    expect(screen.getByText('Activities')).toBeInTheDocument();
    expect(screen.getByText('Real-time agent behavior monitoring')).toBeInTheDocument();
    expect(screen.getByTestId('live-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('simulate-btn')).toBeInTheDocument();
    expect(screen.getByTestId('clear-activities-btn')).toBeInTheDocument();
  });

  it('shows empty state when no activities', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByText('No activities yet')).toBeInTheDocument();
    });
    expect(screen.getByText('Turn on Live mode or click Simulate to generate demo data')).toBeInTheDocument();
  });

  it('shows LIVE indicator after WebSocket connects', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockActivities }) });
    });

    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });
  });

  it('renders activity rows from WebSocket init message', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockActivities }) });
    });

    await waitFor(() => {
      expect(screen.getByTestId('activity-row-act-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('activity-row-act-2')).toBeInTheDocument();
    expect(screen.getByTestId('activity-row-act-3')).toBeInTheDocument();

    // Check activity details
    expect(screen.getAllByText('web-search').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('claude-sonnet-4-5')).toBeInTheDocument();
    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
  });

  it('appends new activities from WebSocket updates', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: [mockActivities[0]] }) });
    });

    await waitFor(() => {
      expect(screen.getByTestId('activity-row-act-1')).toBeInTheDocument();
    });

    const newActivity = {
      id: 'act-4', event_type: 'heartbeat', status: 'completed',
      agent_id: 'agent-1', agent_name: 'test-bot',
      timestamp: new Date().toISOString(),
    };

    act(() => {
      wsOnMessage({ data: JSON.stringify({ type: 'update', data: [newActivity] }) });
    });

    await waitFor(() => {
      expect(screen.getByTestId('activity-row-act-4')).toBeInTheDocument();
    });
    // Original activity should still be there
    expect(screen.getByTestId('activity-row-act-1')).toBeInTheDocument();
  });

  it('shows RECONNECTING when WebSocket disconnects', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockActivities }) });
    });

    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    act(() => {
      wsOnClose();
    });

    await waitFor(() => {
      expect(screen.getByText('RECONNECTING')).toBeInTheDocument();
    });
  });

  it('expands activity row to show verbose output on click', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockActivities }) });
    });

    await waitFor(() => {
      expect(screen.getByTestId('activity-row-act-1')).toBeInTheDocument();
    });

    // Click to expand
    fireEvent.click(screen.getByTestId('activity-row-act-1').querySelector('.cursor-pointer'));

    await waitFor(() => {
      expect(screen.getByText('Verbose output for act-1')).toBeInTheDocument();
    });
    expect(screen.getByText('Verbose Output')).toBeInTheDocument();
  });

  it('displays stats bar with totals', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByText('25')).toBeInTheDocument(); // total
    });
    expect(screen.getByText('2')).toBeInTheDocument(); // running
    expect(screen.getByText('3')).toBeInTheDocument(); // errors
  });

  it('calls clearActivities on clear button click', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('clear-activities-btn')).toBeInTheDocument();
    });

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockActivities }) });
    });

    fireEvent.click(screen.getByTestId('clear-activities-btn'));

    expect(window.confirm).toHaveBeenCalledWith('Clear all activity history?');
    await waitFor(() => {
      expect(mockClearActivities).toHaveBeenCalled();
    });
  });

  it('calls simulateActivities on simulate button click', async () => {
    jest.useRealTimers();
    const { toast } = require('sonner');
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('simulate-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('simulate-btn'));

    await waitFor(() => {
      expect(mockSimulateActivities).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Simulation started');
    });
  });

  it('ignores pong messages from WebSocket', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'pong' }) });
    });

    // Should still show empty state since no real data arrived
    expect(screen.getByText('No activities yet')).toBeInTheDocument();
  });

  it('connects WebSocket to correct URL', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(mockWsInstance).toBeDefined();
    });
    expect(mockWsInstance.url).toBe('ws://localhost:8001/api/ws/activities');
  });

  it('shows event count in filter area', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockActivities }) });
    });

    await waitFor(() => {
      expect(screen.getByText('3 events')).toBeInTheDocument();
    });
  });
});
