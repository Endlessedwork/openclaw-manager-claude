import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ModelsPage from './ModelsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Cpu: (props) => <svg data-testid="icon-cpu" {...props} />,
  Plus: (props) => <svg data-testid="icon-plus" {...props} />,
  Pencil: (props) => <svg data-testid="icon-pencil" {...props} />,
  Trash2: (props) => <svg data-testid="icon-trash" {...props} />,
  Star: (props) => <svg data-testid="icon-star" {...props} />,
  AlertTriangle: (props) => <svg data-testid="icon-alert" {...props} />,
  CheckCircle2: (props) => <svg data-testid="icon-check" {...props} />,
  Server: (props) => <svg data-testid="icon-server" {...props} />,
  X: (props) => <svg data-testid="icon-x" {...props} />,
}));

const mockModels = [
  { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet', key: 'anthropic/claude-sonnet-4-5', provider_id: 'anthropic', enabled: true, is_primary: true, input: '$3/M', context_window: 200000, tags: ['default'] },
  { id: 'openai/gpt-4o', name: 'GPT-4o', key: 'openai/gpt-4o', provider_id: 'openai', enabled: true, is_primary: false, input: '$5/M', context_window: 128000, tags: [] },
];

const mockProviders = [
  { id: 'custom-provider', api: 'openai-completions', base_url: 'https://api.example.com', models: [{ id: 'custom-model' }] },
];

let mockGetModels, mockGetProviders, mockCreateProvider, mockUpdateProvider, mockDeleteProvider;

jest.mock('../lib/api', () => ({
  getModels: (...args) => mockGetModels(...args),
  getProviders: (...args) => mockGetProviders(...args),
  createProvider: (...args) => mockCreateProvider(...args),
  updateProvider: (...args) => mockUpdateProvider(...args),
  deleteProvider: (...args) => mockDeleteProvider(...args),
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
  Button: ({ children, onClick, ...props }) => <button onClick={onClick} {...props}>{children}</button>,
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
  mockGetModels = jest.fn().mockResolvedValue({ data: mockModels });
  mockGetProviders = jest.fn().mockResolvedValue({ data: mockProviders });
  mockCreateProvider = jest.fn().mockResolvedValue({ data: { id: 'new' } });
  mockUpdateProvider = jest.fn().mockResolvedValue({ data: {} });
  mockDeleteProvider = jest.fn().mockResolvedValue({ data: {} });
  window.confirm = jest.fn(() => true);
});

describe('ModelsPage', () => {
  it('renders models and providers after loading', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    });
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.getByText('custom-provider')).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockGetModels.mockReturnValue(new Promise(() => {}));
    render(<ModelsPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no models', async () => {
    mockGetModels.mockResolvedValue({ data: [] });
    mockGetProviders.mockResolvedValue({ data: [] });
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('No models available')).toBeInTheDocument();
    });
  });

  it('displays model details (provider, context, tags)', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('anthropic')).toBeInTheDocument();
    });
    expect(screen.getByText('200,000 tokens')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it('shows Add Provider button for editors', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('create-provider-btn')).toBeInTheDocument();
    });
  });

  it('opens create provider dialog', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('create-provider-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('create-provider-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
  });

  it('calls deleteProvider on delete', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('custom-provider')).toBeInTheDocument();
    });
    // Find delete button in provider cards area
    const deleteButtons = screen.getAllByTestId('icon-trash');
    fireEvent.click(deleteButtons[0].closest('button'));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockDeleteProvider).toHaveBeenCalledWith('custom-provider');
    });
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetModels.mockRejectedValue(new Error('fail'));
    render(<ModelsPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load models');
    });
  });

  it('displays provider models list', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('custom-model')).toBeInTheDocument();
    });
  });
});
