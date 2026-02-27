import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import UsersPage from './UsersPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Users: (props) => <svg data-testid="icon-users" {...props} />,
  Plus: (props) => <svg data-testid="icon-plus" {...props} />,
  Pencil: (props) => <svg data-testid="icon-pencil" {...props} />,
  Trash2: (props) => <svg data-testid="icon-trash" {...props} />,
  Shield: (props) => <svg data-testid="icon-shield" {...props} />,
  Eye: (props) => <svg data-testid="icon-eye" {...props} />,
  Edit3: (props) => <svg data-testid="icon-edit" {...props} />,
}));

const mockUsers = [
  { id: 'user-1', username: 'superadmin1', name: 'Superadmin User', role: 'superadmin', is_active: true, last_login: '2026-02-19T10:00:00Z' },
  { id: 'user-2', username: 'user1', name: 'User One', role: 'user', is_active: true, last_login: null },
  { id: 'user-3', username: 'admin1', name: 'Admin One', role: 'admin', is_active: false, last_login: '2026-02-18T08:00:00Z' },
];

let mockGetUsers, mockCreateUser, mockUpdateUser, mockDeleteUser;

jest.mock('../lib/api', () => ({
  getUsers: (...args) => mockGetUsers(...args),
  createUser: (...args) => mockCreateUser(...args),
  updateUser: (...args) => mockUpdateUser(...args),
  deleteUser: (...args) => mockDeleteUser(...args),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', username: 'superadmin1', role: 'superadmin' } }),
}));

beforeEach(() => {
  mockGetUsers = jest.fn().mockResolvedValue({ data: mockUsers });
  mockCreateUser = jest.fn().mockResolvedValue({ data: { id: 'new-user' } });
  mockUpdateUser = jest.fn().mockResolvedValue({ data: {} });
  mockDeleteUser = jest.fn().mockResolvedValue({ data: {} });
  window.confirm = jest.fn(() => true);
});

describe('UsersPage', () => {
  it('renders user list after loading', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Superadmin User')).toBeInTheDocument();
    });
    expect(screen.getByText('User One')).toBeInTheDocument();
    expect(screen.getByText('Admin One')).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockGetUsers.mockReturnValue(new Promise(() => {}));
    render(<UsersPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('displays user roles with badges', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Superadmin')).toBeInTheDocument();
    });
    // 'User' appears both as a table header and as a role badge, so check for multiple
    expect(screen.getAllByText('User').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('displays usernames', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText('@superadmin1')).toBeInTheDocument();
    });
    expect(screen.getByText('@user1')).toBeInTheDocument();
  });

  it('shows active/disabled status', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      const activeButtons = screen.getAllByText('Active');
      expect(activeButtons.length).toBe(2);
    });
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('shows last login or Never', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Never')).toBeInTheDocument();
    });
  });

  it('opens create user form on Add User click', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Add User')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Add User'));
    expect(screen.getByText('Create User')).toBeInTheDocument();
  });

  it('does not show delete button for current user', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Superadmin User')).toBeInTheDocument();
    });
    // user-1 is current user, should have 2 delete buttons (for user-2 and user-3 only)
    const deleteButtons = screen.getAllByTestId('icon-trash');
    expect(deleteButtons.length).toBe(2);
  });

  it('calls deleteUser on delete click', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText('User One')).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByTestId('icon-trash');
    fireEvent.click(deleteButtons[0].closest('button'));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockDeleteUser).toHaveBeenCalled();
    });
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetUsers.mockRejectedValue(new Error('fail'));
    render(<UsersPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load users');
    });
  });

  it('shows user count', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText('3 users')).toBeInTheDocument();
    });
  });
});
