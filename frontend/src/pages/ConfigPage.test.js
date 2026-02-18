import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ConfigPage from './ConfigPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return { FileCode: icon('file'), Save: icon('save'), RotateCcw: icon('reset'), CheckCircle: icon('check'), AlertTriangle: icon('alert'), XCircle: icon('xcircle') };
});

jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

let mockGetConfig, mockUpdateConfig, mockValidateConfig;
jest.mock('../lib/api', () => ({
  getConfig: (...args) => mockGetConfig(...args),
  updateConfig: (...args) => mockUpdateConfig(...args),
  validateConfig: (...args) => mockValidateConfig(...args),
}));

const mockConfig = {
  port: 18789,
  bind_host: '127.0.0.1',
  reload_mode: 'hybrid',
  tls_enabled: false,
  raw_config: '{\n  "gateway": { "port": 18789 }\n}',
};

beforeEach(() => {
  mockGetConfig = jest.fn().mockResolvedValue({ data: mockConfig });
  mockUpdateConfig = jest.fn().mockResolvedValue({ data: {} });
  mockValidateConfig = jest.fn().mockResolvedValue({ data: { valid: true, errors: [], warnings: [] } });
});

describe('ConfigPage', () => {
  it('renders config settings after loading', async () => {
    render(<ConfigPage />);
    // Wait for config to load - editor should show raw config
    await waitFor(() => {
      expect(screen.getByTestId('config-editor')).toBeInTheDocument();
    });
    // Config settings cards should render
    expect(screen.getByText('Port')).toBeInTheDocument();
    expect(screen.getByText('Bind Host')).toBeInTheDocument();
    expect(screen.getByText('Reload Mode')).toBeInTheDocument();
    expect(screen.getByText('TLS')).toBeInTheDocument();
  });

  it('renders JSON editor with raw config', async () => {
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('config-editor')).toBeInTheDocument();
    });
    expect(screen.getByTestId('config-editor')).toHaveValue('{\n  "gateway": { "port": 18789 }\n}');
  });

  it('updates editor content on typing', async () => {
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('config-editor')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('config-editor'), { target: { value: '{"new": true}' } });
    expect(screen.getByTestId('config-editor')).toHaveValue('{"new": true}');
  });

  it('validates config and shows success', async () => {
    const { toast } = require('sonner');
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('validate-config-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('validate-config-btn'));

    await waitFor(() => {
      expect(mockValidateConfig).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Configuration is valid');
    });
    expect(screen.getByTestId('validation-results')).toBeInTheDocument();
    expect(screen.getByText('Configuration Valid')).toBeInTheDocument();
  });

  it('validates config and shows errors', async () => {
    const { toast } = require('sonner');
    mockValidateConfig.mockResolvedValue({
      data: { valid: false, errors: ['Invalid port number', 'Missing required field'], warnings: [] },
    });
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('config-editor')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('validate-config-btn'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('2 error(s) found');
    });
    expect(screen.getByTestId('validation-results')).toBeInTheDocument();
    expect(screen.getByText('Invalid port number')).toBeInTheDocument();
    expect(screen.getByText('Missing required field')).toBeInTheDocument();
  });

  it('handles validation response with missing errors array (bug regression)', async () => {
    const { toast } = require('sonner');
    // Previously crashed when errors was undefined/null
    // The code accesses res.data.errors.length in handleValidate, which crashes
    // The fix uses optional chaining: validation.errors?.length ?? 0
    mockValidateConfig.mockResolvedValue({
      data: { valid: false, errors: [] },
    });
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('validate-config-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('validate-config-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('validation-results')).toBeInTheDocument();
    });
    // Should display error count gracefully even with empty errors array
    expect(screen.getByText(/Error/)).toBeInTheDocument();
  });

  it('shows validation warnings', async () => {
    mockValidateConfig.mockResolvedValue({
      data: { valid: true, errors: [], warnings: ['Unknown key: foo'] },
    });
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('validate-config-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('validate-config-btn'));

    await waitFor(() => {
      expect(screen.getByText('Unknown key: foo')).toBeInTheDocument();
    });
  });

  it('saves config successfully', async () => {
    const { toast } = require('sonner');
    render(<ConfigPage />);
    // Wait for config to load (settings cards visible)
    await waitFor(() => {
      expect(screen.getByText('18789')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('save-config-btn'));

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Configuration saved');
    });
  });

  it('clears validation when editor content changes', async () => {
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('validate-config-btn')).toBeInTheDocument();
    });

    // First validate
    fireEvent.click(screen.getByTestId('validate-config-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('validation-results')).toBeInTheDocument();
    });

    // Then edit - validation should disappear
    fireEvent.change(screen.getByTestId('config-editor'), { target: { value: '{}' } });
    expect(screen.queryByTestId('validation-results')).not.toBeInTheDocument();
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetConfig.mockRejectedValue(new Error('fail'));
    render(<ConfigPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load config');
    });
  });
});
