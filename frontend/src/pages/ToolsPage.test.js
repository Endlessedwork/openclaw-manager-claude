import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ToolsPage from './ToolsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Wrench: (props) => <svg data-testid="icon-wrench" {...props} />,
  Plus: (props) => <svg data-testid="icon-plus" {...props} />,
  Pencil: (props) => <svg data-testid="icon-pencil" {...props} />,
  Trash2: (props) => <svg data-testid="icon-trash" {...props} />,
  Search: (props) => <svg data-testid="icon-search" {...props} />,
  Shield: (props) => <svg data-testid="icon-shield" {...props} />,
  ShieldOff: (props) => <svg data-testid="icon-shield-off" {...props} />,
}));

const mockTools = [
  { id: 'exec', name: 'exec', tool_name: 'exec', category: 'runtime', description: 'Run shell commands', enabled: true },
  { id: 'browser', name: 'browser', tool_name: 'browser', category: 'ui', description: 'Control the browser', enabled: true },
  { id: 'web_search', name: 'web_search', tool_name: 'web_search', category: 'web', description: 'Search the web', enabled: false },
];

let mockGetTools;

jest.mock('../lib/api', () => ({
  getTools: (...args) => mockGetTools(...args),
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
  mockGetTools = jest.fn().mockResolvedValue({ data: mockTools });
});

describe('ToolsPage', () => {
  it('renders tools grouped by category after loading', async () => {
    render(<ToolsPage />);
    await waitFor(() => {
      expect(screen.getByText('exec')).toBeInTheDocument();
    });
    expect(screen.getByText('browser')).toBeInTheDocument();
    expect(screen.getByText('web_search')).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockGetTools.mockReturnValue(new Promise(() => {}));
    render(<ToolsPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no tools', async () => {
    mockGetTools.mockResolvedValue({ data: [] });
    render(<ToolsPage />);
    await waitFor(() => {
      expect(screen.getByText('No tools found')).toBeInTheDocument();
    });
  });

  it('displays tool descriptions', async () => {
    render(<ToolsPage />);
    await waitFor(() => {
      expect(screen.getByText('Run shell commands')).toBeInTheDocument();
    });
    expect(screen.getByText('Control the browser')).toBeInTheDocument();
  });

  it('shows tool groups reference section', async () => {
    render(<ToolsPage />);
    await waitFor(() => {
      expect(screen.getByText('group:runtime')).toBeInTheDocument();
    });
    expect(screen.getByText('group:web')).toBeInTheDocument();
  });

  it('filters tools by search text', async () => {
    render(<ToolsPage />);
    await waitFor(() => {
      expect(screen.getByText('exec')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('tool-search'), { target: { value: 'browser' } });
    await waitFor(() => {
      expect(screen.getByText('browser')).toBeInTheDocument();
      expect(screen.queryByText('exec')).not.toBeInTheDocument();
    });
  });

  it('opens create dialog on Add Tool click', async () => {
    render(<ToolsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('create-tool-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('create-tool-btn'));
    await waitFor(() => {
      expect(screen.getByText('Add Tool Config')).toBeInTheDocument();
    });
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetTools.mockRejectedValue(new Error('fail'));
    render(<ToolsPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load tools');
    });
  });

  it('renders page title', async () => {
    render(<ToolsPage />);
    expect(screen.getByText('Tools')).toBeInTheDocument();
  });
});
