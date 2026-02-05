import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExportDialog from '../export/ExportDialog';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

// Mock the store
vi.mock('@/store', () => ({
  useProjectStore: () => ({
    currentProject: {
      id: 1,
      name: 'Test Project',
    },
  }),
}));

// Mock API client
vi.mock('@/api/client', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { job_id: 42 } }),
  },
}));

describe('ExportDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not open', () => {
    const { container } = render(
      <ExportDialog open={false} onClose={onClose} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders quality and resolution selectors when open', () => {
    render(<ExportDialog open={true} onClose={onClose} />);

    // Quality buttons (translation keys)
    expect(screen.getByText('qualityLow')).toBeInTheDocument();
    expect(screen.getByText('qualityMedium')).toBeInTheDocument();
    expect(screen.getByText('qualityHigh')).toBeInTheDocument();

    // Resolution buttons
    expect(screen.getByText('1080p')).toBeInTheDocument();
    expect(screen.getByText('720p')).toBeInTheDocument();
    expect(screen.getByText('4K')).toBeInTheDocument();
  });

  it('has a start export button', () => {
    render(<ExportDialog open={true} onClose={onClose} />);
    expect(screen.getByText('startExport')).toBeInTheDocument();
  });

  it('clicking start export triggers API call', async () => {
    const user = userEvent.setup();
    render(<ExportDialog open={true} onClose={onClose} />);

    const exportBtn = screen.getByText('startExport');
    await user.click(exportBtn);

    const apiClient = await import('@/api/client');
    expect(apiClient.default.post).toHaveBeenCalledWith(
      '/projects/1/export',
      expect.objectContaining({
        format: 'mp4',
        quality: 'high',
      }),
    );
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<ExportDialog open={true} onClose={onClose} />);

    const cancelBtn = screen.getByText('cancel');
    await user.click(cancelBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
