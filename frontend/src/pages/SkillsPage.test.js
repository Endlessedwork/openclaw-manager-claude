import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SkillsPage from './SkillsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return { Zap: icon('zap'), Search: icon('search') };
});

jest.mock('../components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));

let mockGetSkills;
jest.mock('../lib/api', () => ({
  getSkills: (...args) => mockGetSkills(...args),
}));

const mockSkills = [
  { id: 'sk-1', name: 'web-search', description: 'Search the web', location: 'bundled', enabled: true, requires_env: ['SEARCH_API_KEY'] },
  { id: 'sk-2', name: 'code-exec', description: null, location: 'workspace', enabled: false, requires_env: [] },
  { id: 'sk-3', name: 'file-reader', description: 'Read files from disk', location: 'managed', enabled: true, requires_env: [] },
];

beforeEach(() => {
  mockGetSkills = jest.fn().mockResolvedValue({ data: mockSkills });
});

describe('SkillsPage', () => {
  it('renders skill rows after loading', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('web-search')).toBeInTheDocument();
    });
    expect(screen.getByText('code-exec')).toBeInTheDocument();
    expect(screen.getByText('file-reader')).toBeInTheDocument();
  });

  it('handles null description without crashing (bug regression)', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('skill-row-sk-2')).toBeInTheDocument();
    });
    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  it('filters skills by name via search', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('web-search')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('skill-search'), { target: { value: 'web' } });

    await waitFor(() => {
      expect(screen.getByText('web-search')).toBeInTheDocument();
      expect(screen.queryByText('code-exec')).not.toBeInTheDocument();
      expect(screen.queryByText('file-reader')).not.toBeInTheDocument();
    });
  });

  it('filters skills by description via search', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('web-search')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('skill-search'), { target: { value: 'disk' } });

    await waitFor(() => {
      expect(screen.getByText('file-reader')).toBeInTheDocument();
      expect(screen.queryByText('web-search')).not.toBeInTheDocument();
    });
  });

  it('search with null description does not crash (bug regression)', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('web-search')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('skill-search'), { target: { value: 'something' } });

    await waitFor(() => {
      expect(screen.getByText('No skills found')).toBeInTheDocument();
    });
  });

  it('shows empty state when search has no results', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('web-search')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('skill-search'), { target: { value: 'nonexistent' } });

    expect(screen.getByText('No skills found')).toBeInTheDocument();
  });

  it('shows active/inactive status badges', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('web-search')).toBeInTheDocument();
    });
    expect(screen.getAllByText('active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('inactive')).toBeInTheDocument();
  });

  it('displays required env vars badges', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('SEARCH_API_KEY')).toBeInTheDocument();
    });
  });

  it('displays location badges', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('bundled')).toBeInTheDocument();
      expect(screen.getByText('workspace')).toBeInTheDocument();
      expect(screen.getByText('managed')).toBeInTheDocument();
    });
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetSkills.mockRejectedValue(new Error('fail'));
    render(<SkillsPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load skills');
    });
  });

  it('renders page title', () => {
    render(<SkillsPage />);
    expect(screen.getByText('Skills')).toBeInTheDocument();
  });

  it('is read-only (no create/edit/delete buttons)', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('web-search')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('create-skill-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });
});
