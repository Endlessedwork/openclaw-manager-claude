import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SessionsPage from './SessionsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return { MessageSquare: icon('msg'), Trash2: icon('trash'), RefreshCw: icon('refresh'), Eye: icon('eye'), X: icon('x'), User: icon('user'), Bot: icon('bot'), Wrench: icon('wrench') };
});

jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, ...props }) => <button onClick={onClick} {...props}>{children}</button>,
}));
jest.mock('../components/ui/dialog', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));
jest.mock('../components/ui/scroll-area', () => ({
  ScrollArea: ({ children }) => <div>{children}</div>,
}));

let mockGetSessions, mockDeleteSession, mockGetSessionMessages;
jest.mock('../lib/api', () => ({
  getSessions: (...args) => mockGetSessions(...args),
  deleteSession: (...args) => mockDeleteSession(...args),
  getSessionMessages: (...args) => mockGetSessionMessages(...args),
}));

const mockSessions = [
  {
    id: 'sess-1', session_key: 'whatsapp:+1234:agent-1', status: 'active',
    agent_id: 'agent-1', channel: 'whatsapp', peer: '+1234567890',
    message_count: 15, last_message_at: '2026-02-17T10:00:00Z',
  },
  {
    id: 'sess-2', session_key: 'discord:user123:agent-2', status: 'ended',
    agent_id: 'agent-2', channel: 'discord', peer: 'user123',
    message_count: 8, last_message_at: '2026-02-17T09:00:00Z',
  },
];

const mockTranscript1 = {
  session: { channel: 'whatsapp', peer: '+1234567890', message_count: 3 },
  messages: [
    { id: 'msg-1', role: 'user', content: 'Hello bot', timestamp: '2026-02-17T10:00:00Z' },
    { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: '2026-02-17T10:00:01Z' },
    { id: 'msg-3', role: 'user', content: 'How are you?', timestamp: '2026-02-17T10:00:02Z' },
  ],
};

const mockTranscript2 = {
  session: { channel: 'discord', peer: 'user123', message_count: 1 },
  messages: [
    { id: 'msg-4', role: 'user', content: 'Different session message', timestamp: '2026-02-17T09:00:00Z' },
  ],
};

beforeEach(() => {
  mockGetSessions = jest.fn().mockResolvedValue({ data: mockSessions });
  mockDeleteSession = jest.fn().mockResolvedValue({ data: {} });
  mockGetSessionMessages = jest.fn().mockResolvedValue({ data: mockTranscript1 });
  window.confirm = jest.fn(() => true);
});

describe('SessionsPage', () => {
  it('renders session list after loading', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('session-row-sess-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('session-row-sess-2')).toBeInTheDocument();
    expect(screen.getByText('whatsapp:+1234:agent-1')).toBeInTheDocument();
    expect(screen.getByText('discord:user123:agent-2')).toBeInTheDocument();
  });

  it('shows empty state when no sessions', async () => {
    mockGetSessions.mockResolvedValue({ data: [] });
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByText('No sessions found')).toBeInTheDocument();
    });
  });

  it('displays session details (agent, channel, peer, message count)', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByText('active')).toBeInTheDocument();
    });
    expect(screen.getByText('ended')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('opens transcript viewer and loads messages', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('view-transcript-sess-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-transcript-sess-1'));

    await waitFor(() => {
      expect(mockGetSessionMessages).toHaveBeenCalledWith('sess-1');
    });
    await waitFor(() => {
      expect(screen.getByText('Hello bot')).toBeInTheDocument();
    });
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
    expect(screen.getByText('How are you?')).toBeInTheDocument();
  });

  it('shows role labels in transcript', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('view-transcript-sess-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-transcript-sess-1'));

    await waitFor(() => {
      expect(screen.getAllByText('user')).toHaveLength(2);
      expect(screen.getByText('assistant')).toBeInTheDocument();
    });
  });

  it('clears previous transcript when switching sessions (bug regression)', async () => {
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('view-transcript-sess-1')).toBeInTheDocument();
    });

    // View first session transcript
    fireEvent.click(screen.getByTestId('view-transcript-sess-1'));
    await waitFor(() => {
      expect(screen.getByText('Hello bot')).toBeInTheDocument();
    });

    // Close dialog by re-rendering without it (simulate onOpenChange)
    // Now set up for second session
    mockGetSessionMessages.mockResolvedValue({ data: mockTranscript2 });

    // View second session transcript
    fireEvent.click(screen.getByTestId('view-transcript-sess-2'));

    // The old transcript messages should be cleared immediately (setTranscript(null))
    // and new ones should load
    await waitFor(() => {
      expect(screen.getByText('Different session message')).toBeInTheDocument();
    });
    // Old messages should NOT be present
    expect(screen.queryByText('Hello bot')).not.toBeInTheDocument();
    expect(screen.queryByText('Hi there!')).not.toBeInTheDocument();
  });

  it('shows "No messages" for empty transcript', async () => {
    mockGetSessionMessages.mockResolvedValue({
      data: { session: {}, messages: [] },
    });
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('view-transcript-sess-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-transcript-sess-1'));

    await waitFor(() => {
      expect(screen.getByText('No messages in this session')).toBeInTheDocument();
    });
  });

  it('deletes session on confirm', async () => {
    const { toast } = require('sonner');
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('session-row-sess-1')).toBeInTheDocument();
    });

    // Find the delete button within the first session row
    const row = screen.getByTestId('session-row-sess-1');
    const deleteBtn = row.querySelectorAll('button')[1]; // second button is delete
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith('Delete this session?');
    await waitFor(() => {
      expect(mockDeleteSession).toHaveBeenCalledWith('sess-1');
      expect(toast.success).toHaveBeenCalledWith('Session deleted');
    });
  });

  it('does not delete when confirm is cancelled', async () => {
    window.confirm = jest.fn(() => false);
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('session-row-sess-1')).toBeInTheDocument();
    });

    const row = screen.getByTestId('session-row-sess-1');
    const deleteBtn = row.querySelectorAll('button')[1];
    fireEvent.click(deleteBtn);

    expect(mockDeleteSession).not.toHaveBeenCalled();
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

  it('shows error toast when transcript load fails', async () => {
    const { toast } = require('sonner');
    mockGetSessionMessages.mockRejectedValue(new Error('fail'));
    render(<SessionsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('view-transcript-sess-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('view-transcript-sess-1'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load transcript');
    });
  });
});
