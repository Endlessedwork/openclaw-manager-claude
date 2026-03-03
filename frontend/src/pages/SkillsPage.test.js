import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import SkillsPage from './SkillsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return { Zap: icon('zap'), Search: icon('search'), AlertTriangle: icon('alert-triangle') };
});

jest.mock('../components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));

jest.mock('../components/ui/select', () => ({
  Select: ({ children, onValueChange, value }) => (
    <div data-testid="select-root" data-value={value}>
      {typeof children === 'function' ? children({ onValueChange }) : children}
    </div>
  ),
  SelectTrigger: ({ children, ...props }) => (
    <button {...props}>{children}</button>
  ),
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value, ...props }) => (
    <option value={value} {...props}>{children}</option>
  ),
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ canEdit: () => true }),
}));

let mockGetSkills;
let mockToggleSkill;
jest.mock('../lib/api', () => ({
  getSkills: (...args) => mockGetSkills(...args),
  toggleSkill: (...args) => mockToggleSkill(...args),
}));

const mockSkills = [
  {
    id: 'github', name: 'github', description: 'GitHub integration', emoji: '\uD83D\uDC19',
    eligible: true, disabled: false, enabled: true, source: 'bundled',
    missing: { bins: [], env: [], os: [] },
  },
  {
    id: 'apple-notes', name: 'apple-notes', description: 'Apple Notes', emoji: '\uD83D\uDCDD',
    eligible: false, disabled: false, enabled: false, source: 'bundled',
    missing: { bins: ['memo'], env: [], os: ['darwin'] },
  },
  {
    id: 'browser', name: 'browser', description: 'Browser automation', emoji: '',
    eligible: true, disabled: true, enabled: false, source: 'managed',
    missing: { bins: [], env: [], os: [] },
  },
];

beforeEach(() => {
  mockGetSkills = jest.fn().mockResolvedValue({ data: mockSkills });
  mockToggleSkill = jest.fn().mockResolvedValue({ data: { success: true } });
});

describe('SkillsPage', () => {
  it('renders tabs with correct counts', async () => {
    render(<SkillsPage />);
    // Wait for skills data to load (github is active, should appear)
    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument();
    });
    expect(screen.getByTestId('tab-active')).toHaveTextContent('Active');
    expect(screen.getByTestId('tab-active')).toHaveTextContent('1');
    expect(screen.getByTestId('tab-inactive')).toHaveTextContent('Inactive');
    expect(screen.getByTestId('tab-inactive')).toHaveTextContent('2');
    expect(screen.getByTestId('tab-all')).toHaveTextContent('All');
    expect(screen.getByTestId('tab-all')).toHaveTextContent('3');
  });

  it('default tab (active) shows only active skills', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument();
    });
    expect(screen.queryByText('apple-notes')).not.toBeInTheDocument();
    expect(screen.queryByText('browser')).not.toBeInTheDocument();
  });

  it('clicking inactive tab shows inactive skills', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-inactive')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-inactive'));
    await waitFor(() => {
      expect(screen.getByText('apple-notes')).toBeInTheDocument();
      expect(screen.getByText('browser')).toBeInTheDocument();
    });
    expect(screen.queryByText('github')).not.toBeInTheDocument();
  });

  it('clicking all tab shows all skills', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-all')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-all'));
    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument();
      expect(screen.getByText('apple-notes')).toBeInTheDocument();
      expect(screen.getByText('browser')).toBeInTheDocument();
    });
  });

  it('shows missing requirements for inactive skills', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-inactive')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-inactive'));
    await waitFor(() => {
      expect(screen.getByText('apple-notes')).toBeInTheDocument();
    });
    expect(screen.getByText(/memo/)).toBeInTheDocument();
    expect(screen.getByText(/darwin/)).toBeInTheDocument();
  });

  it('shows toggle switch for admin users', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-github')).toBeInTheDocument();
    });
  });

  it('calls toggleSkill API when toggle clicked', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-github')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('toggle-github'));
    });
    expect(mockToggleSkill).toHaveBeenCalledWith('github', false);
  });

  it('search filters within current tab', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-all')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-all'));
    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('skill-search'), { target: { value: 'github' } });

    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument();
      expect(screen.queryByText('apple-notes')).not.toBeInTheDocument();
      expect(screen.queryByText('browser')).not.toBeInTheDocument();
    });
  });

  it('shows error toast on load failure', async () => {
    const { toast } = require('sonner');
    mockGetSkills.mockRejectedValue(new Error('fail'));
    render(<SkillsPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load skills');
    });
  });
});
