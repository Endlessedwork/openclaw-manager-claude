import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ChannelsPage from './ChannelsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
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
