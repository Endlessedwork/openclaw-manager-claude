import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RestartBanner from './RestartBanner';

jest.mock('lucide-react', () => ({
  AlertTriangle: (props) => <svg data-testid="icon-alert" {...props} />,
  RotateCcw: (props) => <svg data-testid="icon-rotate" {...props} />,
  X: (props) => <svg data-testid="icon-x" {...props} />,
  Loader2: (props) => <svg data-testid="icon-loader" {...props} />,
}));

let mockBannerState;
jest.mock('../contexts/GatewayBannerContext', () => ({
  useGatewayBanner: () => mockBannerState,
}));

let mockIsAdmin = true;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAdmin: () => mockIsAdmin }),
}));

beforeEach(() => {
  mockIsAdmin = true;
  mockBannerState = {
    restartNeeded: true,
    dismissed: false,
    restarting: false,
    handleRestart: jest.fn(),
    dismissBanner: jest.fn(),
  };
});

describe('RestartBanner', () => {
  it('renders when restartNeeded is true', () => {
    render(<RestartBanner />);
    expect(screen.getByTestId('restart-banner')).toBeInTheDocument();
    expect(screen.getByText('Gateway restart needed')).toBeInTheDocument();
  });

  it('does not render when restartNeeded is false', () => {
    mockBannerState.restartNeeded = false;
    render(<RestartBanner />);
    expect(screen.queryByTestId('restart-banner')).not.toBeInTheDocument();
  });

  it('does not render when dismissed', () => {
    mockBannerState.dismissed = true;
    render(<RestartBanner />);
    expect(screen.queryByTestId('restart-banner')).not.toBeInTheDocument();
  });

  it('shows Restart Now button for admin users', () => {
    render(<RestartBanner />);
    expect(screen.getByTestId('restart-now-btn')).toBeInTheDocument();
    expect(screen.getByText('Restart Now')).toBeInTheDocument();
  });

  it('hides Restart Now button for non-admin users', () => {
    mockIsAdmin = false;
    render(<RestartBanner />);
    expect(screen.queryByTestId('restart-now-btn')).not.toBeInTheDocument();
  });

  it('calls handleRestart when Restart Now is clicked', () => {
    render(<RestartBanner />);
    fireEvent.click(screen.getByTestId('restart-now-btn'));
    expect(mockBannerState.handleRestart).toHaveBeenCalled();
  });

  it('calls dismissBanner when X is clicked', () => {
    render(<RestartBanner />);
    fireEvent.click(screen.getByTestId('dismiss-banner-btn'));
    expect(mockBannerState.dismissBanner).toHaveBeenCalled();
  });

  it('shows Restarting... state when restarting', () => {
    mockBannerState.restarting = true;
    render(<RestartBanner />);
    expect(screen.getByText('Restarting...')).toBeInTheDocument();
    expect(screen.getByTestId('restart-now-btn')).toBeDisabled();
  });
});
