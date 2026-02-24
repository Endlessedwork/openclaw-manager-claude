import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProvidersPage from './ProvidersPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Server: (props) => <svg data-testid="icon-server" {...props} />,
  Plus: (props) => <svg data-testid="icon-plus" {...props} />,
  Pencil: (props) => <svg data-testid="icon-pencil" {...props} />,
  Trash2: (props) => <svg data-testid="icon-trash" {...props} />,
  X: (props) => <svg data-testid="icon-x" {...props} />,
  Wifi: (props) => <svg data-testid="icon-wifi" {...props} />,
  WifiOff: (props) => <svg data-testid="icon-wifi-off" {...props} />,
  Loader2: (props) => <svg data-testid="icon-loader" {...props} />,
  Lock: (props) => <svg data-testid="icon-lock" {...props} />,
  CheckCircle2: (props) => <svg data-testid="icon-check" {...props} />,
  AlertTriangle: (props) => <svg data-testid="icon-alert" {...props} />,
  Download: (props) => <svg data-testid="icon-download" {...props} />,
  Key: (props) => <svg data-testid="icon-key" {...props} />,
  Eye: (props) => <svg data-testid="icon-eye" {...props} />,
  EyeOff: (props) => <svg data-testid="icon-eye-off" {...props} />,
}));

const mockCustomProvider = {
  id: 'my-custom',
  base_url: 'https://api.example.com/v1',
  api: 'openai-completions',
  source: 'custom',
  has_api_key: true,
  models: [{ id: 'custom-model-1', name: 'Custom Model', enabled: true }],
  active_count: 1,
  total_count: 1,
};

const mockBuiltinProvider = {
  id: 'openai',
  api: 'openai-completions',
  source: 'builtin',
  has_api_key: true,
  models: [{ id: 'gpt-4o', name: 'GPT-4o', enabled: true }],
  active_count: 1,
  total_count: 1,
};

const mockProviders = [mockCustomProvider, mockBuiltinProvider];

let mockGetProviders, mockCreateProvider, mockUpdateProvider, mockDeleteProvider, mockTestProviderConnection, mockFetchProviderModels;

jest.mock('../lib/api', () => ({
  getProviders: (...args) => mockGetProviders(...args),
  createProvider: (...args) => mockCreateProvider(...args),
  updateProvider: (...args) => mockUpdateProvider(...args),
  deleteProvider: (...args) => mockDeleteProvider(...args),
  testProviderConnection: (...args) => mockTestProviderConnection(...args),
  fetchProviderModels: (...args) => mockFetchProviderModels(...args),
}));

let mockCanEdit = true;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ canEdit: () => mockCanEdit }),
}));

jest.mock('../contexts/GatewayBannerContext', () => ({
  useGatewayBanner: () => ({ markRestartNeeded: jest.fn() }),
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
  Select: ({ children, onValueChange, value }) => <div data-value={value}>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

beforeEach(() => {
  mockGetProviders = jest.fn().mockResolvedValue({ data: mockProviders });
  mockCreateProvider = jest.fn().mockResolvedValue({ data: { id: 'new' } });
  mockUpdateProvider = jest.fn().mockResolvedValue({ data: {} });
  mockDeleteProvider = jest.fn().mockResolvedValue({ data: {} });
  mockTestProviderConnection = jest.fn().mockResolvedValue({ data: { ok: true, latency_ms: 42 } });
  mockFetchProviderModels = jest.fn().mockResolvedValue({ data: { ok: true, models: [{ id: 'fetched-model', name: 'Fetched' }] } });
  mockCanEdit = true;
  window.confirm = jest.fn(() => true);
});

describe('ProvidersPage', () => {
  it('renders providers after loading (custom + built-in sections)', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('Custom Providers')).toBeInTheDocument();
    expect(screen.getByText('Built-in Providers')).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockGetProviders.mockReturnValue(new Promise(() => {}));
    render(<ProvidersPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no providers', async () => {
    mockGetProviders.mockResolvedValue({ data: [] });
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('No providers found')).toBeInTheDocument();
    });
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetProviders.mockRejectedValue(new Error('fail'));
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load providers');
    });
  });

  it('shows Add Provider button for editors', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('Add Provider')).toBeInTheDocument();
    });
  });

  it('hides Add Provider for non-editors', async () => {
    mockCanEdit = false;
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    expect(screen.queryByText('Add Provider')).not.toBeInTheDocument();
  });

  it('opens create dialog with template picker', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('Add Provider')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Add Provider'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Choose a Provider')).toBeInTheDocument();
    // Templates should be shown (e.g. Anthropic, Google Gemini)
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
  });

  it('applies template (auto-fills form fields)', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('Add Provider')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Add Provider'));
    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Anthropic'));
    // After applying template, the Base URL field should be auto-filled
    await waitFor(() => {
      expect(screen.getByDisplayValue('https://api.anthropic.com/v1')).toBeInTheDocument();
    });
  });

  it('opens edit dialog with provider data pre-filled', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    // Click edit button (pencil icon) for custom provider
    const pencilIcons = screen.getAllByTestId('icon-pencil');
    fireEvent.click(pencilIcons[0].closest('button'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Edit Provider: my-custom')).toBeInTheDocument();
    // Base URL should be pre-filled
    const baseUrlInput = screen.getByPlaceholderText('https://api.example.com/v1');
    expect(baseUrlInput.value).toBe('https://api.example.com/v1');
  });

  it('calls createProvider on save (new provider)', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('Add Provider')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Add Provider'));
    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
    });
    // Apply a template
    fireEvent.click(screen.getByText('Anthropic'));
    await waitFor(() => {
      expect(screen.getByText('Create')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => {
      expect(mockCreateProvider).toHaveBeenCalled();
    });
  });

  it('calls updateProvider on save (editing provider)', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    const pencilIcons = screen.getAllByTestId('icon-pencil');
    fireEvent.click(pencilIcons[0].closest('button'));
    await waitFor(() => {
      expect(screen.getByText('Update')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Update'));
    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith('my-custom', expect.any(Object));
    });
  });

  it('calls deleteProvider on delete with confirm', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    const trashIcons = screen.getAllByTestId('icon-trash');
    fireEvent.click(trashIcons[0].closest('button'));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockDeleteProvider).toHaveBeenCalledWith('my-custom');
    });
  });

  it('cancels delete when confirm is declined', async () => {
    window.confirm = jest.fn(() => false);
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    const trashIcons = screen.getAllByTestId('icon-trash');
    fireEvent.click(trashIcons[0].closest('button'));
    expect(window.confirm).toHaveBeenCalled();
    expect(mockDeleteProvider).not.toHaveBeenCalled();
  });

  it('calls testProviderConnection — success path', async () => {
    const { toast } = require('sonner');
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    // Find Test buttons
    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[0]);
    await waitFor(() => {
      expect(mockTestProviderConnection).toHaveBeenCalledWith('my-custom');
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('my-custom'));
    });
  });

  it('calls testProviderConnection — error path', async () => {
    const { toast } = require('sonner');
    mockTestProviderConnection.mockResolvedValue({ data: { ok: false, error: 'Connection refused' } });
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    const testButtons = screen.getAllByText('Test');
    fireEvent.click(testButtons[0]);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('my-custom: Connection refused');
    });
  });

  it('calls fetchProviderModels — success path with models', async () => {
    const { toast } = require('sonner');
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    // Open edit dialog to access Fetch Models button
    const pencilIcons = screen.getAllByTestId('icon-pencil');
    fireEvent.click(pencilIcons[0].closest('button'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    // Click Fetch Models
    fireEvent.click(screen.getByText('Fetch Models'));
    await waitFor(() => {
      expect(mockFetchProviderModels).toHaveBeenCalledWith('my-custom', { base_url: 'https://api.example.com/v1' });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('1 model'));
    });
  });

  it('disables Fetch Models button when no base_url', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('Add Provider')).toBeInTheDocument();
    });
    // Open create dialog and switch to manual form (no template)
    fireEvent.click(screen.getByText('Add Provider'));
    await waitFor(() => {
      expect(screen.getByText('Custom provider...')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Custom provider...'));
    await waitFor(() => {
      expect(screen.getByText('Fetch Models')).toBeInTheDocument();
    });
    // Fetch Models button should be disabled when base_url is empty
    const fetchBtn = screen.getByText('Fetch Models').closest('button');
    expect(fetchBtn).toBeDisabled();
    expect(mockFetchProviderModels).not.toHaveBeenCalled();
  });

  it('adds single model from fetched list', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    const pencilIcons = screen.getAllByTestId('icon-pencil');
    fireEvent.click(pencilIcons[0].closest('button'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Fetch Models'));
    await waitFor(() => {
      expect(screen.getByText('fetched-model')).toBeInTheDocument();
    });
    // Click the fetched model to add it
    fireEvent.click(screen.getByText('fetched-model'));
    // Model should now appear in the selected models section
    const inputs = screen.getAllByPlaceholderText('model-id');
    const values = inputs.map(i => i.value);
    expect(values).toContain('fetched-model');
  });

  it('adds all models from fetched list', async () => {
    const { toast } = require('sonner');
    mockFetchProviderModels.mockResolvedValue({ data: { ok: true, models: [
      { id: 'model-a', name: 'Model A' },
      { id: 'model-b', name: 'Model B' },
    ] } });
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    const pencilIcons = screen.getAllByTestId('icon-pencil');
    fireEvent.click(pencilIcons[0].closest('button'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Fetch Models'));
    await waitFor(() => {
      expect(screen.getByText('Add all')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Add all'));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Added'));
    });
  });

  it('shows model rows and allows manual add/remove', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    const pencilIcons = screen.getAllByTestId('icon-pencil');
    fireEvent.click(pencilIcons[0].closest('button'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    // Should show the existing model row
    const modelInputs = screen.getAllByPlaceholderText('model-id');
    expect(modelInputs[0].value).toBe('custom-model-1');
    // Click Manual to add a row
    fireEvent.click(screen.getByText('Manual'));
    const updatedInputs = screen.getAllByPlaceholderText('model-id');
    expect(updatedInputs.length).toBe(2);
    // Remove the added row
    const removeButtons = screen.getAllByTestId('icon-x');
    fireEvent.click(removeButtons[removeButtons.length - 1].closest('button'));
    const finalInputs = screen.getAllByPlaceholderText('model-id');
    expect(finalInputs.length).toBe(1);
  });

  it('displays API key status (configured vs missing)', async () => {
    mockGetProviders.mockResolvedValue({ data: [
      { ...mockCustomProvider, has_api_key: true },
      { ...mockBuiltinProvider, has_api_key: false },
    ] });
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    // Key icons should be rendered for both providers
    const keyIcons = screen.getAllByTestId('icon-key');
    expect(keyIcons.length).toBeGreaterThanOrEqual(2);
  });

  it('shows Test/Edit/Delete buttons for custom providers', async () => {
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('my-custom')).toBeInTheDocument();
    });
    // Custom provider should have Test, Edit (pencil), Delete (trash)
    const testButtons = screen.getAllByText('Test');
    expect(testButtons.length).toBeGreaterThanOrEqual(1);
    const trashIcons = screen.getAllByTestId('icon-trash');
    expect(trashIcons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Test/Edit buttons (no Delete) for built-in providers', async () => {
    // Only built-in providers
    mockGetProviders.mockResolvedValue({ data: [mockBuiltinProvider] });
    render(<ProvidersPage />);
    await waitFor(() => {
      expect(screen.getByText('openai')).toBeInTheDocument();
    });
    // Should have Test and Edit but no Delete
    expect(screen.getAllByText('Test').length).toBe(1);
    expect(screen.getAllByTestId('icon-pencil').length).toBe(1);
    expect(screen.queryByTestId('icon-trash')).not.toBeInTheDocument();
  });
});
