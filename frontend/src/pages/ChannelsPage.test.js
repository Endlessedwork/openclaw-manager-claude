import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ChannelsPage from './ChannelsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Wifi: (props) => <svg data-testid="icon-wifi" {...props} />,
  WifiOff: (props) => <svg data-testid="icon-wifi-off" {...props} />,
  MessageCircle: (props) => <svg data-testid="icon-message" {...props} />,
  Pencil: (props) => <svg data-testid="icon-pencil" {...props} />,
  X: (props) => <svg data-testid="icon-x" {...props} />,
  Loader2: (props) => <svg data-testid="icon-loader" {...props} />,
}));

const mockChannels = [
  { id: 'telegram', channel_type: 'telegram', display_name: 'Telegram', enabled: true, status: 'connected', dm_policy: 'pairing', group_policy: 'allowlist', allow_from: ['*'], streaming: 'adaptive', group_allowlist: ['-100123', '-100456'] },
  { id: 'line', channel_type: 'line', display_name: 'LINE', enabled: false, status: 'off', dm_policy: 'open', group_policy: 'mention', allow_from: [], streaming: 'off', group_allowlist: [] },
];

let mockGetChannels, mockUpdateChannel;

jest.mock('../lib/api', () => ({
  getChannels: (...args) => mockGetChannels(...args),
  updateChannel: (...args) => mockUpdateChannel(...args),
}));

let mockCanEdit = true;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ canEdit: () => mockCanEdit }),
}));

const mockMarkRestartNeeded = jest.fn();
jest.mock('../contexts/GatewayBannerContext', () => ({
  useGatewayBanner: () => ({ markRestartNeeded: mockMarkRestartNeeded }),
}));

jest.mock('../components/ui/dialog', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => <button onClick={onClick} disabled={disabled} {...props}>{children}</button>,
}));

jest.mock('../components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));

jest.mock('../components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

jest.mock('../components/ui/textarea', () => ({
  Textarea: (props) => <textarea {...props} />,
}));

jest.mock('../components/ui/select', () => ({
  Select: ({ children, onValueChange, value }) => <div data-value={value}>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

beforeEach(() => {
  mockGetChannels = jest.fn().mockResolvedValue({ data: mockChannels });
  mockUpdateChannel = jest.fn().mockResolvedValue({ data: { status: 'ok', restart_needed: true } });
  mockCanEdit = true;
  mockMarkRestartNeeded.mockClear();
});

describe('ChannelsPage', () => {
  it('renders channel cards after loading', async () => {
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Telegram')).toBeInTheDocument();
    });
    expect(screen.getByText('LINE')).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockGetChannels.mockReturnValue(new Promise(() => {}));
    render(<ChannelsPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('displays channel status correctly', async () => {
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByText('connected')).toBeInTheDocument();
    });
    expect(screen.getByText('off')).toBeInTheDocument();
  });

  it('shows DM and group policy', async () => {
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByText('pairing')).toBeInTheDocument();
    });
    expect(screen.getByText('allowlist')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('mention')).toBeInTheDocument();
  });

  it('shows channel type labels', async () => {
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByText('telegram')).toBeInTheDocument();
    });
    expect(screen.getByText('line')).toBeInTheDocument();
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetChannels.mockRejectedValue(new Error('fail'));
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load channels');
    });
  });

  it('renders page title and subtitle', () => {
    render(<ChannelsPage />);
    expect(screen.getByText('Channels')).toBeInTheDocument();
    expect(screen.getByText('Configure messaging channels and DM policies')).toBeInTheDocument();
  });

  it('renders edit buttons for editors', async () => {
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-channel-telegram')).toBeInTheDocument();
    });
    expect(screen.getByTestId('edit-channel-line')).toBeInTheDocument();
  });

  it('hides edit buttons for viewers', async () => {
    mockCanEdit = false;
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Telegram')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('edit-channel-telegram')).not.toBeInTheDocument();
  });

  it('opens edit dialog with channel data on click', async () => {
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-channel-telegram')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('edit-channel-telegram'));
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Edit Telegram Settings/)).toBeInTheDocument();
  });

  it('shows group allowlist field when groupPolicy is allowlist', async () => {
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-channel-telegram')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('edit-channel-telegram'));
    expect(screen.getByTestId('group-allowlist-input')).toBeInTheDocument();
    expect(screen.getByTestId('group-allowlist-input').value).toBe('-100123\n-100456');
  });

  it('calls updateChannel with correct data on save', async () => {
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-channel-telegram')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('edit-channel-telegram'));
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockUpdateChannel).toHaveBeenCalledWith('telegram', {
        dmPolicy: 'pairing',
        groupPolicy: 'allowlist',
        allowFrom: ['*'],
        streaming: 'adaptive',
        groupAllowlist: ['-100123', '-100456'],
      });
    });
    const { toast } = require('sonner');
    expect(toast.success).toHaveBeenCalledWith('Channel Telegram updated');
    expect(mockMarkRestartNeeded).toHaveBeenCalled();
  });

  it('shows streaming info on card when not off', async () => {
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByText('adaptive')).toBeInTheDocument();
    });
  });

  it('shows group allowlist count on card', async () => {
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByText('2 group(s)')).toBeInTheDocument();
    });
  });
});
