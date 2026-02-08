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

// Mock the timeline store
vi.mock('@/store/timelineStore', () => ({
  useTimelineStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      tracks: [],
      getTimelineDuration: () => 5000,
    }),
}));

// Mock the subtitle store
vi.mock('@/store/subtitleStore', () => ({
  useSubtitleStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      tracks: [],
      activeTrackId: null,
    }),
}));

// Mock ExportEngine
vi.mock('@/engine/ExportEngine', () => ({
  ExportEngine: class {
    static isSupported() {
      return true;
    }
    onProgress: null;
    cancel = vi.fn();
    getStatus = vi.fn().mockReturnValue('idle');
    export = vi.fn().mockResolvedValue(new Blob(['test'], { type: 'video/mp4' }));
  },
  getVideoBitrate: vi.fn().mockReturnValue(12000000),
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

  it('renders FPS options', () => {
    render(<ExportDialog open={true} onClose={onClose} />);
    expect(screen.getByText('24 fps')).toBeInTheDocument();
    expect(screen.getByText('30 fps')).toBeInTheDocument();
    expect(screen.getByText('60 fps')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<ExportDialog open={true} onClose={onClose} />);

    const closeBtn = screen.getByText('export.close');
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
