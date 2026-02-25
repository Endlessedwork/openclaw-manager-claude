import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import WorkspaceGroupsPage from './WorkspaceGroupsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => {
  const C = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return {
    UsersRound: C('users'), RefreshCw: C('refresh'), Search: C('search'),
    Loader2: C('loader'), Pencil: C('pencil'), ChevronDown: C('chevron-down'),
    ChevronRight: C('chevron-right'),
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
  Select: ({ children }) => <div>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

let mockCanEdit = true;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ canEdit: () => mockCanEdit }),
}));

const mockGroups = [
  { _file: 'line_C001.json', platform: 'line', group_id: 'C001', group_name: 'Test Group', status: 'active', member_count: 2, last_seen_at: new Date().toISOString(), members: { U1: { display_name: 'User 1' }, U2: { display_name: 'User 2' } } },
];

let mockGetGroups, mockPatchGroup;
jest.mock('../lib/api', () => ({
  getWorkspaceGroups: (...a) => mockGetGroups(...a),
  patchWorkspaceGroup: (...a) => mockPatchGroup(...a),
}));

beforeEach(() => {
  mockGetGroups = jest.fn().mockResolvedValue({ data: mockGroups });
  mockPatchGroup = jest.fn().mockResolvedValue({ data: {} });
  mockCanEdit = true;
});

describe('WorkspaceGroupsPage', () => {
  it('renders groups after loading', async () => {
    render(<WorkspaceGroupsPage />);
    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });
  });

  it('shows member count', async () => {
    render(<WorkspaceGroupsPage />);
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
  });

  it('expands to show members on click', async () => {
    render(<WorkspaceGroupsPage />);
    await waitFor(() => expect(screen.getByText('Test Group')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('expand-group-line_C001.json'));
    await waitFor(() => {
      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.getByText('User 2')).toBeInTheDocument();
    });
  });
});
