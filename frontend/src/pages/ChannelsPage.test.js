import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ChannelsPage from './ChannelsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Radio: (props) => <svg data-testid="icon-radio" {...props} />,
  Plus: (props) => <svg data-testid="icon-plus" {...props} />,
  Pencil: (props) => <svg data-testid="icon-pencil" {...props} />,
  Trash2: (props) => <svg data-testid="icon-trash" {...props} />,
  Wifi: (props) => <svg data-testid="icon-wifi" {...props} />,
  WifiOff: (props) => <svg data-testid="icon-wifi-off" {...props} />,
  MessageCircle: (props) => <svg data-testid="icon-message" {...props} />,
}));

const mockChannels = [
  { id: 'telegram', channel_type: 'telegram', display_name: 'Telegram', enabled: true, status: 'connected', dm_policy: 'pairing', group_policy: 'mention', allow_from: [] },
  { id: 'line', channel_type: 'line', display_name: 'LINE', enabled: false, status: 'off', dm_policy: 'pairing', group_policy: 'mention', allow_from: [] },
];

let mockGetChannels;

jest.mock('../lib/api', () => ({
  getChannels: (...args) => mockGetChannels(...args),
}));

jest.mock('../components/ui/dialog', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, ...props }) => <button onClick={onClick} {...props}>{children}</button>,
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

jest.mock('../components/ui/switch', () => ({
  Switch: (props) => <input type="checkbox" {...props} />,
}));

jest.mock('../components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

beforeEach(() => {
  mockGetChannels = jest.fn().mockResolvedValue({ data: mockChannels });
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
      const pairingTexts = screen.getAllByText('pairing');
      expect(pairingTexts.length).toBe(2);
    });
    const mentionTexts = screen.getAllByText('mention');
    expect(mentionTexts.length).toBe(2);
  });

  it('opens create dialog on Add Channel click', async () => {
    render(<ChannelsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('create-channel-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('create-channel-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
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
});
