import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('lucide-react', () => ({
  Activity: (props) => <svg data-testid="icon-activity" {...props} />,
}));

const mockLogin = jest.fn();
const mockNavigate = jest.fn();
let mockUser = null;

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, user: mockUser }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Navigate: ({ to }) => <div data-testid="navigate" data-to={to} />,
}), { virtual: true });

// Must import after mocks
const LoginPage = require('./LoginPage').default;

beforeEach(() => {
  mockLogin.mockReset();
  mockNavigate.mockReset();
  mockUser = null;
});

describe('LoginPage', () => {
  it('renders login form', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin')).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('renders W.I.N.E branding', () => {
    render(<LoginPage />);
    expect(screen.getByText('W.I.N.E')).toBeInTheDocument();
  });

  it('calls login on form submit', async () => {
    mockLogin.mockResolvedValue({});
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'testpass' } });
    fireEvent.click(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'testpass');
    });
  });

  it('navigates to / after successful login', async () => {
    mockLogin.mockResolvedValue({});
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'user' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('shows error message on login failure', async () => {
    mockLogin.mockRejectedValue({ response: { data: { detail: 'Invalid username or password' } } });
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'bad' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(screen.getByText('Invalid username or password')).toBeInTheDocument();
    });
  });

  it('shows generic error when no detail', async () => {
    mockLogin.mockRejectedValue(new Error('network'));
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'x' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(screen.getByText('Login failed')).toBeInTheDocument();
    });
  });

  it('shows Signing in... while loading', async () => {
    mockLogin.mockReturnValue(new Promise(() => {}));
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'x' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Sign in'));

    await waitFor(() => {
      expect(screen.getByText('Signing in...')).toBeInTheDocument();
    });
  });
});
