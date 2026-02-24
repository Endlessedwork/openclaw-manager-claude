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
  GripVertical: (props) => <svg data-testid="icon-grip" {...props} />,
  ChevronDown: (props) => <svg data-testid="icon-chevron" {...props} />,
  Save: (props) => <svg data-testid="icon-save" {...props} />,
  Image: (props) => <svg data-testid="icon-image" {...props} />,
  LayoutGrid: (props) => <svg data-testid="icon-layout-grid" {...props} />,
  List: (props) => <svg data-testid="icon-list" {...props} />,
  Loader2: (props) => <svg data-testid="icon-loader" {...props} />,
}));

const mockModels = [
  { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet', key: 'anthropic/claude-sonnet-4-5', provider_id: 'anthropic', enabled: true, is_primary: true, input: '$3/M', context_window: 200000, tags: ['default'] },
  { id: 'openai/gpt-4o', name: 'GPT-4o', key: 'openai/gpt-4o', provider_id: 'openai', enabled: true, is_primary: false, input: '$5/M', context_window: 128000, tags: [] },
];

const mockFallbacks = {
  model: { primary: 'openai/gpt-5.1-codex', fallbacks: ['anthropic/claude-sonnet-4-5', 'openai/gpt-4o'] },
  imageModel: { primary: 'google/gemini-2.5-flash', fallbacks: ['anthropic/claude-sonnet-4-5'] },
  agents: [
    { id: 'main', name: 'main', model: 'anthropic/claude-sonnet-4-5', fallbacks: [] },
  ],
};

let mockGetModels, mockGetFallbacks, mockUpdateFallbacks, mockUpdateAgentFallbacks;

jest.mock('../lib/api', () => ({
  getModels: (...args) => mockGetModels(...args),
  getFallbacks: (...args) => mockGetFallbacks(...args),
  updateFallbacks: (...args) => mockUpdateFallbacks(...args),
  updateAgentFallbacks: (...args) => mockUpdateAgentFallbacks(...args),
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

jest.mock('../components/ui/accordion', () => ({
  Accordion: ({ children }) => <div data-testid="accordion">{children}</div>,
  AccordionItem: ({ children }) => <div>{children}</div>,
  AccordionTrigger: ({ children }) => <button>{children}</button>,
  AccordionContent: ({ children }) => <div>{children}</div>,
}));

let mockSortableListCounter = 0;
jest.mock('../components/SortableFallbackList', () => {
  return function MockSortableFallbackList({ items, onRemove, canEdit }) {
    const listId = mockSortableListCounter++;
    return (
      <div data-testid="sortable-list">
        {items.map((item, idx) => (
          <span key={item}>
            {item}
            {canEdit && onRemove && (
              <button data-testid={`remove-fallback-${listId}-${idx}`} onClick={() => onRemove(item)}>remove</button>
            )}
          </span>
        ))}
      </div>
    );
  };
});

beforeEach(() => {
  mockSortableListCounter = 0;
  mockGetModels = jest.fn().mockResolvedValue({ data: mockModels });
  mockGetFallbacks = jest.fn().mockResolvedValue({ data: mockFallbacks });
  mockUpdateFallbacks = jest.fn().mockResolvedValue({ data: { status: 'ok' } });
  mockUpdateAgentFallbacks = jest.fn().mockResolvedValue({ data: { status: 'ok' } });
  mockCanEdit = true;
});

describe('ModelsPage', () => {
  it('renders models after loading', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    });
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockGetModels.mockReturnValue(new Promise(() => {}));
    render(<ModelsPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no models', async () => {
    mockGetModels.mockResolvedValue({ data: [] });
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

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetModels.mockRejectedValue(new Error('fail'));
    render(<ModelsPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load models');
    });
  });

  it('renders fallback sections', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Text Model Fallback')).toBeInTheDocument();
    });
    expect(screen.getByText('Image Model')).toBeInTheDocument();
  });

  it('displays fallback models in the sortable list', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      const sortableLists = screen.getAllByTestId('sortable-list');
      expect(sortableLists.length).toBeGreaterThan(0);
    });
  });

  it('shows per-agent overrides section', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Per-Agent Overrides')).toBeInTheDocument();
    });
  });

  it('renders view toggle buttons', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Grid view')).toBeInTheDocument();
    expect(screen.getByLabelText('List view')).toBeInTheDocument();
  });

  it('switches to list view showing compact model rows', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('List view'));
    const listView = screen.getByTestId('models-list-view');
    expect(listView).toBeInTheDocument();
    expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('calls updateFallbacks on fallback save', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    });
    // Trigger dirty state by removing a fallback via the remove button
    const removeButtons = screen.getAllByText('remove');
    fireEvent.click(removeButtons[0]);
    // Save button should appear
    const saveButtons = screen.getAllByText('Save Changes');
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      expect(mockUpdateFallbacks).toHaveBeenCalledWith(expect.objectContaining({
        model: expect.any(Object),
        imageModel: expect.any(Object),
      }));
    });
  });

  it('shows save button only when fallback is dirty', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    });
    // Initially no save button
    expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
    // Make a change to trigger dirty state
    const removeButtons = screen.getAllByText('remove');
    fireEvent.click(removeButtons[0]);
    // Now save button should appear
    expect(screen.getAllByText('Save Changes').length).toBeGreaterThan(0);
  });

  it('shows error toast when fallback save fails', async () => {
    const { toast } = require('sonner');
    mockUpdateFallbacks.mockRejectedValue({ response: { data: { detail: 'Save failed' } } });
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    });
    const removeButtons = screen.getAllByText('remove');
    fireEvent.click(removeButtons[0]);
    const saveButtons = screen.getAllByText('Save Changes');
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Save failed');
    });
  });

  it('opens agent edit dialog with agent data', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Edit Fallbacks')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit Fallbacks'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Edit Fallbacks: main')).toBeInTheDocument();
  });

  it('calls updateAgentFallbacks on agent save', async () => {
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Edit Fallbacks')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit Fallbacks'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockUpdateAgentFallbacks).toHaveBeenCalledWith('main', expect.objectContaining({
        model: 'anthropic/claude-sonnet-4-5',
        fallbacks: [],
      }));
    });
  });

  it('shows error toast when agent save fails', async () => {
    const { toast } = require('sonner');
    mockUpdateAgentFallbacks.mockRejectedValue({ response: { data: { detail: 'Agent save failed' } } });
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Edit Fallbacks')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Edit Fallbacks'));
    await waitFor(() => {
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Agent save failed');
    });
  });

  it('hides edit controls for non-editors', async () => {
    mockCanEdit = false;
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    });
    expect(screen.queryByText('Edit Fallbacks')).not.toBeInTheDocument();
    expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
  });

  it('shows Saving... state during save operations', async () => {
    mockUpdateFallbacks.mockReturnValue(new Promise(() => {}));
    render(<ModelsPage />);
    await waitFor(() => {
      expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    });
    const removeButtons = screen.getAllByText('remove');
    fireEvent.click(removeButtons[0]);
    const saveButtons = screen.getAllByText('Save Changes');
    fireEvent.click(saveButtons[0]);
    await waitFor(() => {
      expect(screen.getAllByText('Saving...').length).toBeGreaterThan(0);
    });
  });
});
