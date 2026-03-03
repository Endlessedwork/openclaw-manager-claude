import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MediaPreview from './MediaPreview';

describe('MediaPreview', () => {
  const mockOnImageClick = jest.fn();
  const media = {
    images: [
      { path: '/tmp/img1.jpg', type: 'image/jpeg' },
      { path: '/tmp/img2.jpg', type: 'image/jpeg' }
    ],
    files: [
      { path: '/tmp/doc.pdf', name: 'doc.pdf', type: 'application/pdf' }
    ]
  };

  beforeEach(() => {
    mockOnImageClick.mockClear();
  });

  test('renders first image thumbnail', () => {
    render(<MediaPreview media={media} onImageClick={mockOnImageClick} />);
    const img = screen.getByRole('img');
    expect(img.src).toContain('files.winecore.work/tmp/img1.jpg');
  });

  test('shows count badge for multiple files', () => {
    render(<MediaPreview media={media} onImageClick={mockOnImageClick} />);
    // 2 extra: 1 more image + 1 file
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  test('shows file labels for non-image files', () => {
    render(<MediaPreview media={media} onImageClick={mockOnImageClick} />);
    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
  });

  test('calls onImageClick when image clicked', () => {
    render(<MediaPreview media={media} onImageClick={mockOnImageClick} />);
    const img = screen.getByRole('img');
    fireEvent.click(img);
    expect(mockOnImageClick).toHaveBeenCalledWith('/tmp/img1.jpg');
  });

  test('handles media with only files (no images)', () => {
    const filesOnly = {
      images: [],
      files: [{ path: '/tmp/doc.pdf', name: 'doc.pdf', type: 'application/pdf' }]
    };
    render(<MediaPreview media={filesOnly} onImageClick={mockOnImageClick} />);
    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
  });

  test('renders nothing if media is null', () => {
    const { container } = render(<MediaPreview media={null} onImageClick={mockOnImageClick} />);
    expect(container.firstChild).toBeNull();
  });
});
