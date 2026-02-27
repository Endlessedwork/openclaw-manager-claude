import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SessionsPage from './SessionsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return {
    MessageSquare: icon('msg'), RefreshCw: icon('refresh'), Clock: icon('clock'),
    Cpu: icon('cpu'), Bot: icon('bot'), Hash: icon('hash'), AlertTriangle: icon('alert'),
    Users: icon('users'), User: icon('user'),
  };
});

jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, ...props }) => <button onClick={onClick} {...props}>{children}</button>,
}));

jest.mock('../components/SessionChatSheet', () => ({ open, session }) =>
  open && session ? <div data-testid="session-chat-sheet">Session Chat: {session.agent}</div> : null
);

let mockGetSessions;
jest.mock('../lib/api', () => ({
  getSessions: (...args) => mockGetSessions(...args),
}));

const mockSessions = [
  {
    id: 'sess-1', session_key: 'direct:main:telegram:user1', kind: 'direct',
    agent: 'main', channel: 'telegram', model: 'claude-sonnet-4-5',
    total_tokens: 15000, context_tokens: 5000, age_ms: 120000,
  },
  {
    id: 'sess-2', session_key: 'group:coder:discord:chan1', kind: 'group',
    agent: 'coder', channel: 'discord', model: '',
    total_tokens: 500, context_tokens: 200, age_ms: 7200000,
  },
];

beforeEach(() => {
  mockGetSessions = jest.fn().mockResolvedValue({ data: mockSessions });
});

describe('SessionsPage', () => {
  it('renders session list after loading', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('session-row-sess-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('session-row-sess-2')).toBeInTheDocument();
  });

  it('displays session short IDs', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      // parseSessionKey extracts the last segment of the key
      expect(screen.getByText('user1')).toBeInTheDocument();
    });
    expect(screen.getByText('chan1')).toBeInTheDocument();
  });

  it('shows empty state when no sessions', async () => {
    mockGetSessions.mockResolvedValue({ data: [] });
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByText('No sessions found')).toBeInTheDocument();
    });
  });

  it('shows loading spinner initially', () => {
    mockGetSessions.mockReturnValue(new Promise(() => {}));
    render(<SessionsPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('displays kind badges', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByText('direct')).toBeInTheDocument();
    });
    expect(screen.getByText('group')).toBeInTheDocument();
  });

  it('displays agent and channel info', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('session-row-sess-1')).toBeInTheDocument();
    });
    // Agent info
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('coder')).toBeInTheDocument();
    // Channel info
    expect(screen.getByText('telegram')).toBeInTheDocument();
    expect(screen.getByText('discord')).toBeInTheDocument();
  });

  it('displays token counts', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('session-row-sess-1')).toBeInTheDocument();
    });
    // 15000 tokens → "15.0k", 5000 → "5.0k ctx"
    const row1 = screen.getByTestId('session-row-sess-1');
    expect(row1.textContent).toContain('15.0k');
    expect(row1.textContent).toContain('5.0k');
  });

  it('refreshes sessions on Refresh button click', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('refresh-sessions-btn')).toBeInTheDocument();
    });

    mockGetSessions.mockClear();
    fireEvent.click(screen.getByTestId('refresh-sessions-btn'));

    await waitFor(() => {
      expect(mockGetSessions).toHaveBeenCalledWith(100);
    });
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetSessions.mockRejectedValue(new Error('fail'));
    render(<SessionsPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load sessions');
    });
  });

  it('renders page title with session count', async () => {
    render(<SessionsPage />);
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/2 total/)).toBeInTheDocument();
    });
  });

  it('shows model for sessions that have one', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByText('claude-sonnet-4-5')).toBeInTheDocument();
    });
  });

  it('opens chat sheet when clicking a session row', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('session-row-sess-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('session-row-sess-1'));
    await waitFor(() => {
      expect(screen.getByTestId('session-chat-sheet')).toBeInTheDocument();
      expect(screen.getByText('Session Chat: main')).toBeInTheDocument();
    });
  });
});
