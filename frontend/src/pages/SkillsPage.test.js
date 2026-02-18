import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SkillsPage from './SkillsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return { Zap: icon('zap'), Plus: icon('plus'), Pencil: icon('pencil'), Trash2: icon('trash'), Search: icon('search') };
});

jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, ...props }) => <button onClick={onClick} {...props}>{children}</button>,
}));
jest.mock('../components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));
jest.mock('../components/ui/label', () => ({
  Label: ({ children, ...props }) => <label>{children}</label>,
}));
jest.mock('../components/ui/textarea', () => ({
  Textarea: (props) => <textarea {...props} />,
}));
jest.mock('../components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, ...props }) => (
    <input type="checkbox" checked={checked} onChange={() => onCheckedChange?.(!checked)} data-testid={props['data-testid']} />
  ),
}));
jest.mock('../components/ui/dialog', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));
jest.mock('../components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children }) => <div>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

let mockGetSkills, mockCreateSkill, mockUpdateSkill, mockDeleteSkill;
jest.mock('../lib/api', () => ({
  getSkills: (...args) => mockGetSkills(...args),
  createSkill: (...args) => mockCreateSkill(...args),
  updateSkill: (...args) => mockUpdateSkill(...args),
  deleteSkill: (...args) => mockDeleteSkill(...args),
}));

const mockSkills = [
  { id: 'sk-1', name: 'web-search', description: 'Search the web', location: 'bundled', enabled: true, requires_env: ['SEARCH_API_KEY'] },
  { id: 'sk-2', name: 'code-exec', description: null, location: 'workspace', enabled: false, requires_env: [] },
  { id: 'sk-3', name: 'file-reader', description: 'Read files from disk', location: 'managed', enabled: true, requires_env: [] },
];

beforeEach(() => {
  mockGetSkills = jest.fn().mockResolvedValue({ data: mockSkills });
  mockCreateSkill = jest.fn().mockResolvedValue({ data: { id: 'sk-new' } });
  mockUpdateSkill = jest.fn().mockResolvedValue({ data: {} });
  mockDeleteSkill = jest.fn().mockResolvedValue({ data: {} });
  window.confirm = jest.fn(() => true);
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
    // sk-2 has description: null - this previously crashed the filter
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('skill-row-sk-2')).toBeInTheDocument();
    });
    // Null description should show fallback text
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

    // Searching should not crash even with null descriptions
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

  it('calls updateSkill to toggle enabled state', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-skill-sk-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toggle-skill-sk-1'));

    await waitFor(() => {
      expect(mockUpdateSkill).toHaveBeenCalledWith('sk-1', expect.objectContaining({ enabled: false }));
    });
  });

  it('shows correct toast when disabling an enabled skill', async () => {
    const { toast } = require('sonner');
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-skill-sk-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toggle-skill-sk-1'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Skill disabled');
    });
  });

  it('shows correct toast when enabling a disabled skill', async () => {
    const { toast } = require('sonner');
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-skill-sk-2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toggle-skill-sk-2'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Skill enabled');
    });
  });

  it('opens create dialog on New Skill click', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('create-skill-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-skill-btn'));

    await waitFor(() => {
      expect(screen.getByText('Create Skill')).toBeInTheDocument();
    });
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
});
