import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import WorkspaceUsersPage from './WorkspaceUsersPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => {
  const C = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return {
    UserCircle: C('user-circle'), RefreshCw: C('refresh'), Search: C('search'),
    Loader2: C('loader'), Pencil: C('pencil'),
  };
});

jest.mock('../components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
jest.mock('../components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));
jest.mock('../components/ui/dialog', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
}));
jest.mock('../components/ui/select', () => ({
  Select: ({ children, value, onValueChange }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));
jest.mock('../components/ui/textarea', () => ({
  Textarea: (props) => <textarea {...props} />,
}));

let mockCanEdit = true;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ canEdit: () => mockCanEdit }),
}));

const mockUsers = [
  { _file: 'line_U001.json', platform: 'line', user_id: 'U001', display_name: 'Alice', role: 'member', status: 'active', last_seen_at: new Date().toISOString() },
  { _file: 'telegram_T001.json', platform: 'telegram', user_id: 'T001', display_name: 'Bob', role: 'guest', status: 'new', last_seen_at: null },
];

let mockGetUsers, mockPatchUser;
jest.mock('../lib/api', () => ({
  getWorkspaceUsers: (...a) => mockGetUsers(...a),
  patchWorkspaceUser: (...a) => mockPatchUser(...a),
}));

beforeEach(() => {
  mockGetUsers = jest.fn().mockResolvedValue({ data: mockUsers });
  mockPatchUser = jest.fn().mockResolvedValue({ data: {} });
  mockCanEdit = true;
});

describe('WorkspaceUsersPage', () => {
  it('renders users after loading', async () => {
    render(<WorkspaceUsersPage />);
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  it('shows loading spinner initially', () => {
    mockGetUsers.mockReturnValue(new Promise(() => {}));
    render(<WorkspaceUsersPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('filters by search text', async () => {
    render(<WorkspaceUsersPage />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Search by name or ID...'), { target: { value: 'Alice' } });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('hides edit button for non-editors', async () => {
    mockCanEdit = false;
    render(<WorkspaceUsersPage />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.queryByTestId('edit-user-line_U001.json')).not.toBeInTheDocument();
  });

  it('opens edit dialog and saves', async () => {
    render(<WorkspaceUsersPage />);
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('edit-user-line_U001.json'));
    await waitFor(() => expect(screen.getByText('Edit Alice')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockPatchUser).toHaveBeenCalledWith('line_U001.json', expect.objectContaining({ role: 'member' }));
    });
  });
});
