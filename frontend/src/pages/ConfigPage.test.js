import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ConfigPage from './ConfigPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return {
    FileCode: icon('file'), Save: icon('save'), RotateCcw: icon('reset'),
    CheckCircle: icon('check'), AlertTriangle: icon('alert'), XCircle: icon('xcircle'),
    Server: icon('server'), Bot: icon('bot'), Wrench: icon('wrench'),
    MessageSquare: icon('message'), Terminal: icon('terminal'), Package: icon('package'),
    Plug: icon('plug'), Eye: icon('eye'), EyeOff: icon('eyeoff'),
    X: icon('x'), Plus: icon('plus'),
  };
});

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ canEdit: () => true }),
}));

jest.mock('../components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

jest.mock('../components/ui/input', () => ({
  Input: ({ className, ...props }) => <input {...props} />,
}));

jest.mock('../components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

jest.mock('../components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, ...props }) => (
    <input type="checkbox" checked={checked} onChange={e => onCheckedChange(e.target.checked)} {...props} />
  ),
}));

jest.mock('../components/ui/select', () => ({
  Select: ({ children, value, onValueChange }) => (
    <div data-value={value} data-mock-select>{children}</div>
  ),
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children, ...props }) => <button {...props}>{children}</button>,
  SelectValue: () => null,
}));

jest.mock('../components/ui/accordion', () => ({
  Accordion: ({ children, ...props }) => <div {...props}>{children}</div>,
  AccordionItem: ({ children, ...props }) => <div {...props}>{children}</div>,
  AccordionTrigger: ({ children, ...props }) => <div {...props}>{children}</div>,
  AccordionContent: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

let mockGetConfig, mockUpdateConfig, mockValidateConfig;
jest.mock('../lib/api', () => ({
  getConfig: (...args) => mockGetConfig(...args),
  updateConfig: (...args) => mockUpdateConfig(...args),
  validateConfig: (...args) => mockValidateConfig(...args),
}));

const mockFullConfig = {
  gateway: { port: 18789, bind: 'loopback', auth: { mode: 'token', token: 'test-token' }, tailscale: { mode: 'off', resetOnExit: false }, controlUi: { allowedOrigins: ['*'] } },
  agents: { defaults: { workspace: '/home/test/.openclaw/workspace', maxConcurrent: 5, compaction: { mode: 'default', memoryFlush: { enabled: true } } } },
  tools: { web: { search: { apiKey: 'test-key' } }, elevated: { enabled: true, allowFrom: { '*': ['*'] } }, sandbox: { tools: { allow: ['exec', 'read'] } } },
  messages: { ackReactionScope: 'group-mentions' },
  commands: { native: 'auto', nativeSkills: 'auto', restart: true },
  skills: { install: { nodeManager: 'npm' } },
  plugins: { entries: { telegram: { enabled: true }, line: { enabled: true } } },
};

const mockConfig = {
  port: 18789,
  bind_host: 'loopback',
  reload_mode: 'local',
  tls: false,
  raw: JSON.stringify(mockFullConfig, null, 2),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConfig = jest.fn().mockResolvedValue({ data: mockConfig });
  mockUpdateConfig = jest.fn().mockResolvedValue({ data: {} });
  mockValidateConfig = jest.fn().mockResolvedValue({ data: { valid: true, errors: [], warnings: [] } });
});

describe('ConfigPage', () => {
  it('renders form view by default with all 7 accordion section headers', async () => {
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
    });
    expect(screen.getByText('Gateway')).toBeInTheDocument();
    expect(screen.getByText('Agent Defaults')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Commands')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Plugins')).toBeInTheDocument();
  });

  it('switches to JSON tab and shows editor', async () => {
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-json')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tab-json'));

    await waitFor(() => {
      expect(screen.getByTestId('config-editor')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('config-form')).not.toBeInTheDocument();
  });

  it('populates form fields from config data', async () => {
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('field-gateway-port')).toBeInTheDocument();
    });
    expect(screen.getByTestId('field-gateway-port')).toHaveValue(18789);
  });

  it('saves config from form view (serializes fullConfig)', async () => {
    const { toast } = require('sonner');
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('save-config-btn'));

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledWith({ raw: JSON.stringify(mockFullConfig, null, 2) });
      expect(toast.success).toHaveBeenCalledWith('Configuration saved');
    });
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
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('validate-config-btn'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('2 error(s) found');
    });
    expect(screen.getByTestId('validation-results')).toBeInTheDocument();
    expect(screen.getByText('Invalid port number')).toBeInTheDocument();
    expect(screen.getByText('Missing required field')).toBeInTheDocument();
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

  it('handles tab switch back and forth', async () => {
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
    });

    // Switch to JSON tab
    fireEvent.click(screen.getByTestId('tab-json'));
    await waitFor(() => {
      expect(screen.getByTestId('config-editor')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('config-form')).not.toBeInTheDocument();

    // Switch back to form tab
    fireEvent.click(screen.getByTestId('tab-form'));
    await waitFor(() => {
      expect(screen.getByTestId('config-form')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('config-editor')).not.toBeInTheDocument();
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetConfig.mockRejectedValue(new Error('fail'));
    render(<ConfigPage />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load config');
    });
  });

  it('saves config from JSON tab', async () => {
    const { toast } = require('sonner');
    render(<ConfigPage />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-json')).toBeInTheDocument();
    });

    // Switch to JSON tab
    fireEvent.click(screen.getByTestId('tab-json'));
    await waitFor(() => {
      expect(screen.getByTestId('config-editor')).toBeInTheDocument();
    });

    // Modify the JSON
    fireEvent.change(screen.getByTestId('config-editor'), { target: { value: '{"modified": true}' } });

    // Save
    fireEvent.click(screen.getByTestId('save-config-btn'));

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledWith({ raw: '{"modified": true}' });
      expect(toast.success).toHaveBeenCalledWith('Configuration saved');
    });
  });
});
