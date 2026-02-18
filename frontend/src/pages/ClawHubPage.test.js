import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ClawHubPage from './ClawHubPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Store: (props) => <svg data-testid="icon-store" {...props} />,
  Search: (props) => <svg data-testid="icon-search" {...props} />,
  Download: (props) => <svg data-testid="icon-download" {...props} />,
  Trash2: (props) => <svg data-testid="icon-trash" {...props} />,
  Star: (props) => <svg data-testid="icon-star" {...props} />,
  ExternalLink: (props) => <svg data-testid="icon-external" {...props} />,
  Package: (props) => <svg data-testid="icon-package" {...props} />,
  CheckCircle: (props) => <svg data-testid="icon-check" {...props} />,
  Key: (props) => <svg data-testid="icon-key" {...props} />,
}));

const mockSkills = [
  { id: 'sk-1', slug: 'web-scraper', name: 'Web Scraper', description: 'Scrape websites', author: 'openclaw', category: 'web', version: '1.0.0', downloads: 1234, stars: 45, installed: false, tags: ['web', 'scraper'], requires_env: [] },
  { id: 'sk-2', slug: 'postgres-query', name: 'Postgres Query', description: 'Query PostgreSQL databases', author: 'community', category: 'coding', version: '2.1.0', downloads: 567, stars: 23, installed: true, installed_version: '2.1.0', tags: ['database'], requires_env: ['DATABASE_URL'] },
];

let mockGetClawHubSkills, mockInstallClawHubSkill, mockUninstallClawHubSkill;

jest.mock('../lib/api', () => ({
  getClawHubSkills: (...args) => mockGetClawHubSkills(...args),
  installClawHubSkill: (...args) => mockInstallClawHubSkill(...args),
  uninstallClawHubSkill: (...args) => mockUninstallClawHubSkill(...args),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ canEdit: () => true }),
}));

jest.mock('../components/ui/dialog', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => <button onClick={onClick} disabled={disabled} {...props}>{children}</button>,
}));

jest.mock('../components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));

jest.mock('../components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

jest.mock('../components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

beforeEach(() => {
  mockGetClawHubSkills = jest.fn().mockResolvedValue({ data: mockSkills });
  mockInstallClawHubSkill = jest.fn().mockResolvedValue({ data: { status: 'installed' } });
  mockUninstallClawHubSkill = jest.fn().mockResolvedValue({ data: { status: 'uninstalled' } });
  window.confirm = jest.fn(() => true);
});

describe('ClawHubPage', () => {
  it('renders skills after loading', async () => {
    render(<ClawHubPage />);
    await waitFor(() => {
      expect(screen.getByText('Web Scraper')).toBeInTheDocument();
    });
    expect(screen.getByText('Postgres Query')).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockGetClawHubSkills.mockReturnValue(new Promise(() => {}));
    render(<ClawHubPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no skills', async () => {
    mockGetClawHubSkills.mockResolvedValue({ data: [] });
    render(<ClawHubPage />);
    await waitFor(() => {
      expect(screen.getByText('No skills found')).toBeInTheDocument();
    });
  });

  it('displays skill details (author, category, version)', async () => {
    render(<ClawHubPage />);
    await waitFor(() => {
      expect(screen.getByText('@openclaw')).toBeInTheDocument();
    });
    expect(screen.getByText('@community')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('v2.1.0')).toBeInTheDocument();
  });

  it('shows installed status for installed skills', async () => {
    render(<ClawHubPage />);
    await waitFor(() => {
      expect(screen.getByText(/Installed v2\.1\.0/)).toBeInTheDocument();
    });
    expect(screen.getByText('Not installed')).toBeInTheDocument();
  });

  it('shows install button for uninstalled skills', async () => {
    render(<ClawHubPage />);
    await waitFor(() => {
      expect(screen.getByTestId('install-web-scraper')).toBeInTheDocument();
    });
  });

  it('shows uninstall button for installed skills', async () => {
    render(<ClawHubPage />);
    await waitFor(() => {
      expect(screen.getByTestId('uninstall-postgres-query')).toBeInTheDocument();
    });
  });

  it('calls installClawHubSkill on install click', async () => {
    render(<ClawHubPage />);
    await waitFor(() => {
      expect(screen.getByTestId('install-web-scraper')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('install-web-scraper'));
    await waitFor(() => {
      expect(mockInstallClawHubSkill).toHaveBeenCalledWith('sk-1', {});
    });
  });

  it('calls uninstallClawHubSkill on uninstall click', async () => {
    render(<ClawHubPage />);
    await waitFor(() => {
      expect(screen.getByTestId('uninstall-postgres-query')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('uninstall-postgres-query'));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockUninstallClawHubSkill).toHaveBeenCalledWith('sk-2');
    });
  });

  it('displays stats bar with counts', async () => {
    render(<ClawHubPage />);
    await waitFor(() => {
      expect(screen.getByText('2 skills found')).toBeInTheDocument();
    });
    expect(screen.getByText('1 installed')).toBeInTheDocument();
  });

  it('shows env requirement badges', async () => {
    render(<ClawHubPage />);
    await waitFor(() => {
      expect(screen.getByText('DATABASE_URL')).toBeInTheDocument();
    });
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetClawHubSkills.mockRejectedValue(new Error('fail'));
    render(<ClawHubPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load ClawHub');
    });
  });
});
