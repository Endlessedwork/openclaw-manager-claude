# Image Display in Session Chat — Design Document

**Date:** 2026-03-04
**Status:** Approved

## Overview

Transform `[media attached: ...]` text blocks in session chat messages into inline media previews. Users can view images inline and click to expand fullscreen, while non-image files display as text labels.

## Requirements

- Display first image from media attachments as thumbnail (~150px)
- Show badge "N more files attached" for multiple files
- Click image → fullscreen modal
- Non-image files → text indicator (e.g., "📎 document.pdf")
- Handle missing files gracefully with placeholder
- File server: `https://files.winecore.work`

## Architecture

### Media Parsing

**Input format:**
```
[media attached: /tmp/image1.jpg (image/jpeg) | /tmp/file.pdf (application/pdf) | /tmp/image2.png (image/png)]
```

**Output structure:**
```javascript
{
  images: [
    { path: '/tmp/image1.jpg', type: 'image/jpeg' },
    { path: '/tmp/image2.png', type: 'image/png' }
  ],
  files: [
    { path: '/tmp/file.pdf', name: 'file.pdf', type: 'application/pdf' }
  ],
  remaining: 'actual message text after media block'
}
```

### Component Changes

**MessageContent Component** (`SessionChatSheet.js`):
1. New function `parseMediaBlock(text)` — extract media attachments
2. Return both parsed media and remaining message text
3. Render media preview + message text together

**New Component: MediaPreview**
- Props: `media` (parsed media object), `onImageClick(imagePath)`
- Render:
  - First image as thumbnail (if exists)
  - Badge "N more files" if multiple files total
  - Text labels for non-image files
- Image URL: `https://files.winecore.work{path}`

**New Component: ImageModal**
- Fullscreen modal on image click
- Dark overlay, centered image
- Filename below image
- Close on ESC or outside click

## Data Flow

1. Message text arrives: `"[media attached: ...] Some text here"`
2. `parseMediaBlock()` extracts media + remaining text
3. `MessageContent` renders:
   ```
   <MediaPreview media={parsed.media} onImageClick={...} />
   <div>{parsed.remaining}</div>
   ```
4. User clicks image → opens `ImageModal` with fullscreen view

## Error Handling

- **404 or missing file:** Show placeholder `"🖼️ Image unavailable"`
- **Invalid URL:** Skip with placeholder
- **Parsing error:** Show original `[media attached: ...]` text as fallback

## Files to Modify

- `frontend/src/components/SessionChatSheet.js` — Update `MessageContent`, add parsing
- `frontend/src/components/MediaPreview.js` — New component
- `frontend/src/components/ImageModal.js` — New component

## Testing Considerations

- Messages with single image
- Messages with multiple images
- Messages with mixed image + non-image files
- Messages with 404/missing files
- Modal open/close interaction
- Responsive sizing on mobile

## UI/UX Notes

- Thumbnail respects dark theme (dark background)
- Badge uses consistent styling with existing badges (orange/blue)
- Fullscreen modal uses existing Sheet/Dialog patterns from shadcn/ui
