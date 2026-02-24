import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AgentsPage from './AgentsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Bot: (props) => <svg data-testid="icon-bot" {...props} />,
  Plus: (props) => <svg data-testid="icon-plus" {...props} />,
  Pencil: (props) => <svg data-testid="icon-pencil" {...props} />,
  Trash2: (props) => <svg data-testid="icon-trash" {...props} />,
  X: (props) => <svg data-testid="icon-x" {...props} />,
  ChevronDown: (props) => <svg data-testid="icon-chevron" {...props} />,
}));

const mockAgents = [
  {
    id: 'agent-1', name: 'test-agent', description: 'A test agent for unit testing',
    status: 'active', model_primary: 'anthropic/claude-sonnet-4-5', tools_profile: 'full',
    sandbox_mode: 'off', is_default: true, workspace: '~/.openclaw/workspace',
    model_fallbacks: [], tools_allow: [], tools_deny: [],
  },
  {
    id: 'agent-2', name: 'secondary-agent', description: 'Another agent',
    status: 'inactive', model_primary: 'openai/gpt-4o', tools_profile: 'minimal',
    sandbox_mode: 'all', is_default: false, workspace: '~/.openclaw/workspace',
    model_fallbacks: [], tools_allow: [], tools_deny: [],
  },
];

let mockGetAgents, mockGetAgent, mockGetModels, mockUpdateAgentMd, mockUpdateAgentFallbacks;

jest.mock('../lib/api', () => ({
  getAgents: (...args) => mockGetAgents(...args),
  getAgent: (...args) => mockGetAgent(...args),
  getModels: (...args) => mockGetModels(...args),
  updateAgentMd: (...args) => mockUpdateAgentMd(...args),
  updateAgentFallbacks: (...args) => mockUpdateAgentFallbacks(...args),
}));

jest.mock('../contexts/GatewayBannerContext', () => ({
  useGatewayBanner: () => ({ markRestartNeeded: jest.fn() }),
}));

jest.mock('../components/ui/dialog', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

jest.mock('../components/ui/tabs', () => ({
  Tabs: ({ children }) => <div>{children}</div>,
  TabsContent: ({ children, value }) => <div data-testid={`tab-${value}`}>{children}</div>,
  TabsList: ({ children }) => <div>{children}</div>,
  TabsTrigger: ({ children, value }) => <button data-testid={`tab-trigger-${value}`}>{children}</button>,
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
  mockGetAgents = jest.fn().mockResolvedValue({ data: mockAgents });
  mockGetAgent = jest.fn().mockResolvedValue({ data: { soul_md: '', agents_md: '', identity_md: '' } });
  mockGetModels = jest.fn().mockResolvedValue({ data: [] });
  mockUpdateAgentMd = jest.fn().mockResolvedValue({ data: {} });
  mockUpdateAgentFallbacks = jest.fn().mockResolvedValue({ data: { status: 'ok' } });
});

describe('AgentsPage', () => {
  it('renders agent cards after loading', async () => {
    render(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByText('test-agent')).toBeInTheDocument();
    });
    expect(screen.getByText('secondary-agent')).toBeInTheDocument();
    expect(screen.getByText('A test agent for unit testing')).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockGetAgents.mockReturnValue(new Promise(() => {}));
    render(<AgentsPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no agents', async () => {
    mockGetAgents.mockResolvedValue({ data: [] });
    render(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByText('No agents configured')).toBeInTheDocument();
    });
  });

  it('displays agent details correctly', async () => {
    render(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByText('test-agent')).toBeInTheDocument();
    });
    // Model is split into provider + model name across two spans
    expect(screen.getByText('anthropic')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4-5')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('inactive')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it('opens create dialog when clicking New Agent', async () => {
    render(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('create-agent-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('create-agent-btn'));
    await waitFor(() => {
      expect(screen.getByText('Create Agent')).toBeInTheDocument();
    });
  });

  it('opens edit dialog with agent data when clicking edit', async () => {
    render(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-agent-agent-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('edit-agent-agent-1'));
    await waitFor(() => {
      expect(screen.getByText('Edit Agent')).toBeInTheDocument();
    });
    const nameInput = screen.getByTestId('agent-name-input');
    expect(nameInput).toHaveValue('test-agent');
  });

  it('shows delete buttons on agent cards', async () => {
    render(<AgentsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('delete-agent-agent-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('delete-agent-agent-2')).toBeInTheDocument();
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetAgents.mockRejectedValue(new Error('fail'));
    render(<AgentsPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load agents');
    });
  });

  it('renders page title and subtitle', () => {
    render(<AgentsPage />);
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('Manage agent configurations')).toBeInTheDocument();
  });
});
