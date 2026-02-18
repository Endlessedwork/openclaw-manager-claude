import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CronPage from './CronPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => ({
  Clock: (props) => <svg data-testid="icon-clock" {...props} />,
  Plus: (props) => <svg data-testid="icon-plus" {...props} />,
  Pencil: (props) => <svg data-testid="icon-pencil" {...props} />,
  Trash2: (props) => <svg data-testid="icon-trash" {...props} />,
  Play: (props) => <svg data-testid="icon-play" {...props} />,
  Pause: (props) => <svg data-testid="icon-pause" {...props} />,
}));

const mockJobs = [
  { id: 'job-1', name: 'Daily Report', schedule: '0 9 * * *', agent_id: 'main', task: 'Generate daily report', enabled: true, timeout_seconds: 300, status: 'idle', run_count: 42 },
  { id: 'job-2', name: 'Cleanup', schedule: '0 0 * * 0', agent_id: 'ops', task: 'Clean old sessions', enabled: false, timeout_seconds: 600, status: 'idle', run_count: 5 },
];

let mockGetCronJobs;

jest.mock('../lib/api', () => ({
  getCronJobs: (...args) => mockGetCronJobs(...args),
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

beforeEach(() => {
  mockGetCronJobs = jest.fn().mockResolvedValue({ data: mockJobs });
});

describe('CronPage', () => {
  it('renders cron jobs after loading', async () => {
    render(<CronPage />);
    await waitFor(() => {
      expect(screen.getByText('Daily Report')).toBeInTheDocument();
    });
    expect(screen.getByText('Cleanup')).toBeInTheDocument();
  });

  it('shows loading spinner initially', () => {
    mockGetCronJobs.mockReturnValue(new Promise(() => {}));
    render(<CronPage />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no jobs', async () => {
    mockGetCronJobs.mockResolvedValue({ data: [] });
    render(<CronPage />);
    await waitFor(() => {
      expect(screen.getByText('No cron jobs')).toBeInTheDocument();
    });
  });

  it('displays schedule and status', async () => {
    render(<CronPage />);
    await waitFor(() => {
      expect(screen.getByText('0 9 * * *')).toBeInTheDocument();
    });
    expect(screen.getByText('0 0 * * 0')).toBeInTheDocument();
    const idleTexts = screen.getAllByText('idle');
    expect(idleTexts.length).toBe(2);
  });

  it('displays agent and run info', async () => {
    render(<CronPage />);
    await waitFor(() => {
      expect(screen.getByText('Agent: main')).toBeInTheDocument();
    });
    expect(screen.getByText('Agent: ops')).toBeInTheDocument();
    expect(screen.getByText('Runs: 42')).toBeInTheDocument();
  });

  it('opens create dialog on New Job click', async () => {
    render(<CronPage />);
    await waitFor(() => {
      expect(screen.getByTestId('create-cron-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('create-cron-btn'));
    await waitFor(() => {
      expect(screen.getByText('New Cron Job')).toBeInTheDocument();
    });
  });

  it('shows error toast when load fails', async () => {
    const { toast } = require('sonner');
    mockGetCronJobs.mockRejectedValue(new Error('fail'));
    render(<CronPage />);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load cron jobs');
    });
  });

  it('renders page title', () => {
    render(<CronPage />);
    expect(screen.getByText('Cron Jobs')).toBeInTheDocument();
    expect(screen.getByText('Schedule recurring agent tasks')).toBeInTheDocument();
  });
});
