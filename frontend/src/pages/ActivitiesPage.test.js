import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import ActivitiesPage from './ActivitiesPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

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
    ArrowDown: icon('arrow-down'), Users: icon('users'), List: icon('list'),
    ArrowRight: icon('arrow-right'), X: icon('x'), Sparkles: icon('sparkles'),
    FolderOpen: icon('folder'), Shield: icon('shield'), Eye: icon('eye'),
  };
});

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

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

let mockGetAgents, mockGetActivitiesStats, mockGetAgent;
jest.mock('../lib/api', () => ({
  getActivitiesStats: (...args) => mockGetActivitiesStats(...args),
  getAgents: (...args) => mockGetAgents(...args),
  getAgent: (...args) => mockGetAgent(...args),
  getWsUrl: (path, token) => `ws://localhost:8001/api/ws/${path}`,
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
  { id: 'agent-1', name: 'test-bot', status: 'active', description: 'Test Bot Agent', model_primary: 'claude-sonnet', identity_emoji: '' },
  { id: 'agent-2', name: 'helper-agent', status: 'active', description: 'Helper Agent', model_primary: 'gpt-4', identity_emoji: '' },
  { id: 'agent-3', name: 'silent-agent', status: 'active', description: 'Agent with no activities', model_primary: 'claude-haiku', identity_emoji: '' },
];

const mockAgentDetail = {
  id: 'agent-1', name: 'test-bot', description: 'Test Bot Agent',
  model_primary: 'claude-sonnet', workspace: '/home/ubuntu/.openclaw/workspace/test-bot',
  soul_md: '# Test Bot\nI am a test bot.', identity_md: '', agents_md: '',
};

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
  mockGetAgent = jest.fn().mockResolvedValue({ data: mockAgentDetail });
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
  });

  it('shows all agents even without activities', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    // Wait for agents to load — all 3 should show as cards even without WS data
    await waitFor(() => {
      expect(screen.getByTestId('agent-card-test-bot')).toBeInTheDocument();
    });
    expect(screen.getByTestId('agent-card-helper-agent')).toBeInTheDocument();
    expect(screen.getByTestId('agent-card-silent-agent')).toBeInTheDocument();
  });

  it('shows LIVE indicator after WebSocket connects in stream view', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-stream'));

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockActivities }) });
    });

    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });
  });

  it('renders activity rows from WebSocket init message in stream view', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-stream'));

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockActivities }) });
    });

    await waitFor(() => {
      expect(screen.getByTestId('activity-row-act-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('activity-row-act-2')).toBeInTheDocument();
    expect(screen.getByTestId('activity-row-act-3')).toBeInTheDocument();
  });

  it('appends new activities from WebSocket updates', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-stream'));

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
    expect(screen.getByTestId('activity-row-act-1')).toBeInTheDocument();
  });

  it('shows RECONNECTING when WebSocket disconnects in stream view', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-stream'));

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

  it('expands activity row to show verbose output on click in stream view', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-stream'));

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockActivities }) });
    });

    await waitFor(() => {
      expect(screen.getByTestId('activity-row-act-1')).toBeInTheDocument();
    });

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
      expect(screen.getByText('25')).toBeInTheDocument();
    });
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('ignores pong messages from WebSocket', async () => {
    jest.useRealTimers();
    // Use no agents to test truly empty state
    mockGetAgents = jest.fn().mockResolvedValue({ data: [] });
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'pong' }) });
    });

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
      expect(screen.getByText(/3 events/)).toBeInTheDocument();
    });
  });

  // ─── Agent View Tests ────────────────────────────────────────────────────

  it('defaults to agents view mode', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    expect(screen.getByTestId('view-agents')).toBeInTheDocument();
    expect(screen.getByTestId('view-stream')).toBeInTheDocument();
  });

  it('shows agent cards grouped by agent in agents view', async () => {
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
      expect(screen.getByTestId('agent-card-test-bot')).toBeInTheDocument();
    });
    expect(screen.getByTestId('agent-card-helper-agent')).toBeInTheDocument();
  });

  it('shows currently running activities in agent card', async () => {
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
      expect(screen.getByTestId('agent-card-test-bot')).toBeInTheDocument();
    });

    expect(screen.getByText('Currently Doing')).toBeInTheDocument();
    expect(screen.getByText(/Thinking with claude-sonnet/)).toBeInTheDocument();
  });

  it('shows errors section in agent card', async () => {
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
      expect(screen.getByTestId('agent-card-helper-agent')).toBeInTheDocument();
    });

    const helperCard = screen.getByTestId('agent-card-helper-agent');
    expect(helperCard).toHaveTextContent('Errors');
    expect(helperCard).toHaveTextContent('Connection timeout');
  });

  it('shows Active status badge for agents with running activities', async () => {
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
      expect(screen.getByTestId('agent-card-test-bot')).toBeInTheDocument();
    });

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('switches between agents and stream views', async () => {
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
      expect(screen.getByTestId('agent-card-test-bot')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-stream'));

    await waitFor(() => {
      expect(screen.getByText('Activity Stream')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-agents'));

    await waitFor(() => {
      expect(screen.getByTestId('agent-card-test-bot')).toBeInTheDocument();
    });
  });

  it('shows agent count in filter area', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: mockActivities }) });
    });

    // 3 agents from list (test-bot, helper-agent, silent-agent)
    await waitFor(() => {
      expect(screen.getByText(/3 agents/)).toBeInTheDocument();
    });
  });

  it('shows agent with no activities as "No Activity" card', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('agent-card-silent-agent')).toBeInTheDocument();
    });

    const silentCard = screen.getByTestId('agent-card-silent-agent');
    expect(silentCard).toHaveTextContent('No Activity');
    expect(silentCard).toHaveTextContent('No recent activity');
  });

  it('opens agent detail panel when clicking agent card', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('agent-card-test-bot')).toBeInTheDocument();
    });

    // Click agent card header
    const card = screen.getByTestId('agent-card-test-bot');
    fireEvent.click(card.querySelector('.cursor-pointer'));

    await waitFor(() => {
      expect(screen.getByTestId('agent-detail-test-bot')).toBeInTheDocument();
    });

    // Should show agent info
    expect(screen.getByTestId('agent-detail-test-bot')).toHaveTextContent('Test Bot Agent');
    expect(mockGetAgent).toHaveBeenCalledWith('agent-1');
  });

  it('loads and shows SOUL.md in agent detail', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('agent-card-test-bot')).toBeInTheDocument();
    });

    const card = screen.getByTestId('agent-card-test-bot');
    fireEvent.click(card.querySelector('.cursor-pointer'));

    await waitFor(() => {
      expect(screen.getByText('SOUL.md')).toBeInTheDocument();
    });
    expect(screen.getByText(/I am a test bot/)).toBeInTheDocument();
  });

  it('closes agent detail panel when clicking close button', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('agent-card-test-bot')).toBeInTheDocument();
    });

    const card = screen.getByTestId('agent-card-test-bot');
    fireEvent.click(card.querySelector('.cursor-pointer'));

    await waitFor(() => {
      expect(screen.getByTestId('agent-detail-test-bot')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('close-detail'));

    await waitFor(() => {
      expect(screen.queryByTestId('agent-detail-test-bot')).not.toBeInTheDocument();
    });
  });

  it('hides embedded agent from activities', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('activities-page')).toBeInTheDocument();
    });

    const embeddedActivity = {
      id: 'act-emb-1', event_type: 'tool_call', status: 'completed',
      agent_id: 'embedded', agent_name: 'embedded', tool_name: 'internal-op',
      timestamp: new Date().toISOString(),
    };

    act(() => {
      wsOnOpen();
      wsOnMessage({ data: JSON.stringify({ type: 'init', data: [...mockActivities, embeddedActivity] }) });
    });

    // Should NOT show embedded agent card
    await waitFor(() => {
      expect(screen.getByTestId('agent-card-test-bot')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('agent-card-embedded')).not.toBeInTheDocument();

    // Switch to stream view — embedded should also be hidden
    fireEvent.click(screen.getByTestId('view-stream'));
    await waitFor(() => {
      expect(screen.getByText('Activity Stream')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('activity-row-act-emb-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('activity-row-act-1')).toBeInTheDocument();
  });

  it('shows agent description in card', async () => {
    jest.useRealTimers();
    render(<ActivitiesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('agent-card-test-bot')).toBeInTheDocument();
    });

    const card = screen.getByTestId('agent-card-test-bot');
    expect(card).toHaveTextContent('Test Bot Agent');
  });
});
