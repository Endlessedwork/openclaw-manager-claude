# Image Display in Session Chat Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display inline image previews in session chat messages with fullscreen modal on click, and show non-image file indicators.

**Architecture:** Parse `[media attached: ...]` text blocks into structured media data (images + files). Render first image as thumbnail with count badge using new `MediaPreview` component. Fullscreen modal via new `ImageModal` component. All media URLs built from `https://files.winecore.work` + file path.

**Tech Stack:** React (19), Tailwind CSS, shadcn/ui (Dialog), Lucide icons

---

## Task 1: Create parseMediaBlock utility function

**Files:**
- Create: `frontend/src/utils/mediaParser.js`
- Test: `frontend/src/utils/mediaParser.test.js`

**Step 1: Write failing test**

```javascript
// frontend/src/utils/mediaParser.test.js
import { parseMediaBlock } from './mediaParser';

describe('parseMediaBlock', () => {
  test('parses single image', () => {
    const text = '[media attached: /tmp/img.jpg (image/jpeg)]\nHello world';
    const result = parseMediaBlock(text);

    expect(result.media.images).toEqual([
      { path: '/tmp/img.jpg', type: 'image/jpeg' }
    ]);
    expect(result.media.files).toEqual([]);
    expect(result.remaining).toBe('Hello world');
  });

  test('parses multiple mixed files', () => {
    const text = '[media attached: /tmp/img1.jpg (image/jpeg) | /tmp/doc.pdf (application/pdf) | /tmp/img2.png (image/png)]';
    const result = parseMediaBlock(text);

    expect(result.media.images).toEqual([
      { path: '/tmp/img1.jpg', type: 'image/jpeg' },
      { path: '/tmp/img2.png', type: 'image/png' }
    ]);
    expect(result.media.files).toEqual([
      { path: '/tmp/doc.pdf', name: 'doc.pdf', type: 'application/pdf' }
    ]);
  });

  test('returns null media if no attachment block', () => {
    const text = 'Just plain text';
    const result = parseMediaBlock(text);

    expect(result.media).toBeNull();
    expect(result.remaining).toBe('Just plain text');
  });

  test('handles text before and after media block', () => {
    const text = 'Before\n[media attached: /tmp/x.jpg (image/jpeg)]\nAfter';
    const result = parseMediaBlock(text);

    expect(result.media.images.length).toBe(1);
    expect(result.remaining).toBe('Before\nAfter');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- src/utils/mediaParser.test.js
```

Expected: FAIL - "mediaParser not defined"

**Step 3: Write minimal implementation**

```javascript
// frontend/src/utils/mediaParser.js

/**
 * Parse [media attached: ...] blocks from message text
 * Format: [media attached: /path1 (type1) | /path2 (type2)]
 *
 * Returns: { media: null | { images: [], files: [] }, remaining: string }
 */
export function parseMediaBlock(text) {
  // Match [media attached: ... text ...]
  const blockRegex = /\[media attached: ([^\]]+)\]/;
  const match = text.match(blockRegex);

  if (!match) {
    return { media: null, remaining: text };
  }

  const mediaStr = match[1];
  const remaining = text.replace(blockRegex, '').trim();

  // Split by | to get individual files
  const files = mediaStr.split('|').map(f => f.trim());

  const images = [];
  const nonImages = [];

  for (const file of files) {
    // Parse: /path/to/file.ext (mime/type)
    const fileMatch = file.match(/^([^\s]+)\s+\(([^)]+)\)$/);
    if (!fileMatch) continue;

    const [, path, mimeType] = fileMatch;
    const fileName = path.split('/').pop();

    if (mimeType.startsWith('image/')) {
      images.push({ path, type: mimeType });
    } else {
      nonImages.push({ path, name: fileName, type: mimeType });
    }
  }

  return {
    media: {
      images,
      files: nonImages
    },
    remaining
  };
}
```

**Step 4: Run test to verify it passes**

```bash
cd frontend && npm test -- src/utils/mediaParser.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/utils/mediaParser.js frontend/src/utils/mediaParser.test.js
git commit -m "feat: add mediaParser utility for extracting media from message text"
```

---

## Task 2: Create MediaPreview component

**Files:**
- Create: `frontend/src/components/MediaPreview.js`
- Test: `frontend/src/components/MediaPreview.test.js`

**Step 1: Write failing test**

```javascript
// frontend/src/components/MediaPreview.test.js
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

  test('renders first image thumbnail', () => {
    render(<MediaPreview media={media} onImageClick={mockOnImageClick} />);
    const img = screen.getByRole('img');
    expect(img.src).toContain('files.winecore.work/tmp/img1.jpg');
  });

  test('shows count badge for multiple files', () => {
    render(<MediaPreview media={media} onImageClick={mockOnImageClick} />);
    expect(screen.getByText('2 more files')).toBeInTheDocument();
  });

  test('shows file labels for non-image files', () => {
    render(<MediaPreview media={media} onImageClick={mockOnImageClick} />);
    expect(screen.getByText(/📎 doc\.pdf/)).toBeInTheDocument();
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
    expect(screen.getByText(/📎 doc\.pdf/)).toBeInTheDocument();
  });

  test('renders nothing if media is null', () => {
    const { container } = render(<MediaPreview media={null} onImageClick={mockOnImageClick} />);
    expect(container.firstChild).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- src/components/MediaPreview.test.js
```

Expected: FAIL - "MediaPreview not defined"

**Step 3: Write implementation**

```javascript
// frontend/src/components/MediaPreview.js
import React from 'react';
import { FileIcon, AlertCircle } from 'lucide-react';

const MEDIA_SERVER = 'https://files.winecore.work';

function MediaPreview({ media, onImageClick }) {
  if (!media) return null;

  const { images = [], files = [] } = media;
  const totalOthers = images.length + files.length - (images.length > 0 ? 1 : 0);

  return (
    <div className="flex flex-col gap-2 mb-2">
      {/* First image thumbnail */}
      {images.length > 0 && (
        <div className="relative inline-block">
          <button
            onClick={() => onImageClick(images[0].path)}
            className="relative group overflow-hidden rounded-md focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            <img
              src={`${MEDIA_SERVER}${images[0].path}`}
              alt="Media"
              className="h-40 w-auto object-cover bg-surface-sunken"
              onError={(e) => {
                e.currentTarget.src = '';
                e.currentTarget.className += ' hidden';
                // Show placeholder
              }}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>

          {/* Count badge */}
          {totalOthers > 0 && (
            <div className="absolute bottom-2 right-2 bg-orange-500 text-white text-xs font-medium px-2 py-1 rounded-md">
              +{totalOthers} more
            </div>
          )}
        </div>
      )}

      {/* Non-image files */}
      {files.length > 0 && (
        <div className="flex flex-col gap-1">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-theme-muted">
              <FileIcon className="w-3.5 h-3.5" />
              <span className="truncate">{file.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Placeholder for missing image */}
      {images.length === 0 && files.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-theme-dimmed">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>No viewable media</span>
        </div>
      )}
    </div>
  );
}

export default MediaPreview;
```

**Step 4: Run test to verify it passes**

```bash
cd frontend && npm test -- src/components/MediaPreview.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/MediaPreview.js frontend/src/components/MediaPreview.test.js
git commit -m "feat: create MediaPreview component for inline media display"
```

---

## Task 3: Create ImageModal component

**Files:**
- Create: `frontend/src/components/ImageModal.js`

**Step 1: Write the component**

```javascript
// frontend/src/components/ImageModal.js
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const MEDIA_SERVER = 'https://files.winecore.work';

function ImageModal({ imagePath, onClose }) {
  if (!imagePath) return null;

  const fileName = imagePath.split('/').pop();

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-screen flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-2 rounded-lg bg-black/50 hover:bg-black/70 text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Image */}
        <img
          src={`${MEDIA_SERVER}${imagePath}`}
          alt={fileName}
          className="max-h-screen w-auto object-contain"
        />

        {/* Filename */}
        <div className="text-center text-sm text-gray-300 mt-3">
          {fileName}
        </div>
      </div>
    </div>
  );
}

export default ImageModal;
```

**Step 2: Manually verify component structure**

- Modal overlays entire screen with dark background
- Image centered with max constraints
- Close button (X) in top-right
- Filename displayed below
- ESC key closes modal
- Click outside closes modal

**Step 3: Commit**

```bash
git add frontend/src/components/ImageModal.js
git commit -m "feat: create ImageModal component for fullscreen image viewing"
```

---

## Task 4: Update MessageContent to parse and render media

**Files:**
- Modify: `frontend/src/components/SessionChatSheet.js`

**Step 1: Import new utilities and components**

In `SessionChatSheet.js`, add imports at top:

```javascript
import { parseMediaBlock } from '../utils/mediaParser';
import MediaPreview from './MediaPreview';
import ImageModal from './ImageModal';
```

**Step 2: Update MessageContent component**

Replace the `MessageContent` component (lines 74-115) with:

```javascript
function MessageContent({ msg }) {
  const [selectedImage, setSelectedImage] = React.useState(null);
  const isToolCall = msg.message_type === 'tool_call';
  const text = msg.message || '';

  // Tool call: show as icon badge
  if (isToolCall) {
    const toolMatch = text.match(/\[tool_call:\s*(.+?)\]/);
    const toolName = toolMatch ? toolMatch[1] : text;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border bg-violet-500/10 border-violet-500/20 text-violet-400">
        <Wrench className="w-3 h-3" />
        {toolName}
      </span>
    );
  }

  // Conversation metadata block: strip metadata, show only the actual message
  const meta = extractConversationMeta(text);
  if (meta) {
    const afterMeta = text.replace(/Conversation info \(untrusted metadata\):\s*```json\s*\{[\s\S]*?\}\s*```\s*/, '').trim();
    if (!afterMeta) {
      return (
        <>
          <ImageModal imagePath={selectedImage} onClose={() => setSelectedImage(null)} />
          <div>Meta block with no text</div>
        </>
      );
    }
    const parsed = parseMediaBlock(afterMeta);
    return (
      <>
        <ImageModal imagePath={selectedImage} onClose={() => setSelectedImage(null)} />
        {parsed.media && <MediaPreview media={parsed.media} onImageClick={setSelectedImage} />}
        <div>{processDirectives(parsed.remaining)}</div>
      </>
    );
  }

  // System preamble: strip [date][System Message][sessionId] and show body
  const { timestamp: sysTs, body: sysBody } = parseSystemPreamble(text);
  if (sysTs) {
    const cleaned = stripInternalInstructions(sysBody);
    const parsed = parseMediaBlock(cleaned);
    return (
      <>
        <ImageModal imagePath={selectedImage} onClose={() => setSelectedImage(null)} />
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] text-theme-dimmed">
            <Clock className="w-2.5 h-2.5" />
            {sysTs}
          </span>
          {parsed.media && <MediaPreview media={parsed.media} onImageClick={setSelectedImage} />}
          <div className="whitespace-pre-wrap">{processDirectives(parsed.remaining)}</div>
        </div>
      </>
    );
  }

  // Regular message: process [[directives]] and media
  const parsed = parseMediaBlock(text);
  return (
    <>
      <ImageModal imagePath={selectedImage} onClose={() => setSelectedImage(null)} />
      {parsed.media && <MediaPreview media={parsed.media} onImageClick={setSelectedImage} />}
      <div className="whitespace-pre-wrap">{processDirectives(parsed.remaining)}</div>
    </>
  );
}
```

**Step 2: Run dev server and test manually**

```bash
cd frontend && yarn start
```

Navigate to Sessions page, click a session with media, verify:
- Images display as thumbnails
- Count badge shows for multiple files
- Clicking image opens fullscreen modal
- ESC or click outside closes modal
- Non-image files show as text labels

**Step 3: Commit**

```bash
git add frontend/src/components/SessionChatSheet.js
git commit -m "feat: integrate media parsing and preview in SessionChatSheet"
```

---

## Task 5: Test error handling

**Step 1: Test 404 handling**

Navigate to a message with a non-existent image path. Verify the browser shows broken image icon or placeholder.

Update `MediaPreview` to show placeholder on error:

```javascript
// In MediaPreview component, update the img onError:
onError={(e) => {
  e.currentTarget.classList.add('hidden');
  // Create placeholder div
  const placeholder = document.createElement('div');
  placeholder.className = 'h-40 w-40 bg-surface-sunken rounded-md flex items-center justify-center text-xs text-theme-dimmed';
  placeholder.textContent = '🖼️ Image unavailable';
  e.currentTarget.parentNode.appendChild(placeholder);
}}
```

**Step 2: Test parsing edge cases**

Manually create messages with:
- Media attachment at end with no remaining text
- Media attachment in middle with text before and after
- Multiple images only (no files)
- Multiple files only (no images)

Verify all render correctly.

**Step 3: Commit**

```bash
git add frontend/src/components/MediaPreview.js
git commit -m "feat: add image unavailable placeholder for 404 errors"
```

---

## Summary of Changes

| File | Change | Lines |
|------|--------|-------|
| `frontend/src/utils/mediaParser.js` | NEW | Media parsing utility |
| `frontend/src/utils/mediaParser.test.js` | NEW | Parser tests |
| `frontend/src/components/MediaPreview.js` | NEW | Inline preview component |
| `frontend/src/components/MediaPreview.test.js` | NEW | Preview tests |
| `frontend/src/components/ImageModal.js` | NEW | Fullscreen modal |
| `frontend/src/components/SessionChatSheet.js` | MODIFY | Integrate media display |

**Total commits:** 5
**Test coverage:** Parser + Preview tested, Modal tested manually, Integration tested in dev

---

## Checklist Before Submitting PR

- [ ] All tests pass: `cd frontend && npm test`
- [ ] Dev server runs: `yarn start`
- [ ] Manual testing: sessions with images, multipl files, missing files
- [ ] No console errors
- [ ] Images display inline in chat
- [ ] Modal opens/closes correctly
- [ ] Fullscreen image displays correctly
- [ ] ESC key closes modal
- [ ] Click outside modal closes it
- [ ] Non-image files show as text labels
- [ ] Count badge shows correctly for multiple files
