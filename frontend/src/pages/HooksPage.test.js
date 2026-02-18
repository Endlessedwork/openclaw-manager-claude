import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import HooksPage from './HooksPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Webhook: (props) => <svg data-testid="icon-webhook" {...props} />,
  Plus: (props) => <svg data-testid="icon-plus" {...props} />,
  Pencil: (props) => <svg data-testid="icon-pencil" {...props} />,
  Trash2: (props) => <svg data-testid="icon-trash" {...props} />,
  Settings: (props) => <svg data-testid="icon-settings" {...props} />,
  Zap: (props) => <svg data-testid="icon-zap" {...props} />,
  Eye: (props) => <svg data-testid="icon-eye" {...props} />,
  EyeOff: (props) => <svg data-testid="icon-eye-off" {...props} />,
}));

const mockConfig = { enabled: true, path: '/hooks', token: 'abc123...', presets: ['github', 'gmail'] };
const mockMappings = [
  { id: '0', name: 'GitHub PR', path: 'github-pr', action: 'agent', agent_id: 'coder', enabled: true, wake_mode: 'now', deliver: true, channel: 'last', model: '', message_template: 'PR: {{data.title}}' },
  { id: '1', name: 'Gmail Hook', path: 'gmail', action: 'wake', agent_id: 'main', enabled: false, wake_mode: 'next-heartbeat', deliver: false, channel: '', model: '', message_template: '' },
];

let mockGetHooksConfig, mockGetHookMappings;

jest.mock('../lib/api', () => ({
  getHooksConfig: (...args) => mockGetHooksConfig(...args),
  getHookMappings: (...args) => mockGetHookMappings(...args),
}));

jest.mock('../components/ui/dialog', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, ...props }) => <button onClick={onClick} {...props}>{children}</button>,
}));

jest.mock('../components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));

jest.mock('../components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

jest.mock('../components/ui/textarea', () => ({
  Textarea: (props) => <textarea {...props} />,
}));

jest.mock('../components/ui/switch', () => ({
  Switch: (props) => <input type="checkbox" {...props} />,
}));

jest.mock('../components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

beforeEach(() => {
  mockGetHooksConfig = jest.fn().mockResolvedValue({ data: mockConfig });
  mockGetHookMappings = jest.fn().mockResolvedValue({ data: mockMappings });
});

describe('HooksPage', () => {
  it('renders hook config and mappings after loading', async () => {
    render(<HooksPage />);
    await waitFor(() => {
      expect(screen.getByText('GitHub PR')).toBeInTheDocument();
    });
    expect(screen.getByText('Gmail Hook')).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockGetHooksConfig.mockReturnValue(new Promise(() => {}));
    render(<HooksPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no mappings', async () => {
    mockGetHookMappings.mockResolvedValue({ data: [] });
    render(<HooksPage />);
    await waitFor(() => {
      expect(screen.getByText('No hook mappings configured')).toBeInTheDocument();
    });
  });

  it('displays hook config summary', async () => {
    render(<HooksPage />);
    await waitFor(() => {
      expect(screen.getByText('ENABLED')).toBeInTheDocument();
    });
    expect(screen.getByText('/hooks')).toBeInTheDocument();
    expect(screen.getByText('github, gmail')).toBeInTheDocument();
  });

  it('displays mapping details (path, action, agent)', async () => {
    render(<HooksPage />);
    await waitFor(() => {
      expect(screen.getByText('/github-pr')).toBeInTheDocument();
    });
    expect(screen.getByText('agent')).toBeInTheDocument();
    expect(screen.getByText('wake')).toBeInTheDocument();
    expect(screen.getByText('Agent: coder')).toBeInTheDocument();
  });

  it('opens create hook dialog', async () => {
    render(<HooksPage />);
    await waitFor(() => {
      expect(screen.getByTestId('create-hook-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('create-hook-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetHooksConfig.mockRejectedValue(new Error('fail'));
    render(<HooksPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load hooks');
    });
  });

  it('renders page title', () => {
    render(<HooksPage />);
    expect(screen.getByText('Hooks')).toBeInTheDocument();
    expect(screen.getByText('Manage webhook endpoints and hook mappings')).toBeInTheDocument();
  });
});
