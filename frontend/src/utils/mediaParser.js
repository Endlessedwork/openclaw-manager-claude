/**
 * Parse [media attached: ...] blocks from message text.
 * Format: [media attached: /path1 (type1) | /path2 (type2)]
 *
 * Returns: { media: null | { images: [], files: [] }, remaining: string }
 */
export function parseMediaBlock(text) {
  const blockRegex = /\[media attached: ([^\]]+)\]/;
  const match = text.match(blockRegex);

  if (!match) {
    return { media: null, remaining: text };
  }

  const mediaStr = match[1];
  // Remove media block and collapse surrounding newlines
  const remaining = text.replace(/\n?\[media attached: [^\]]+\]\n?/, '\n').trim();

  const entries = mediaStr.split('|').map(f => f.trim());

  const images = [];
  const files = [];

  for (const entry of entries) {
    const fileMatch = entry.match(/^([^\s]+)\s+\(([^)]+)\)$/);
    if (!fileMatch) continue;

    const [, path, mimeType] = fileMatch;
    const fileName = path.split('/').pop();

    if (mimeType.startsWith('image/')) {
      images.push({ path, type: mimeType });
    } else {
      files.push({ path, name: fileName, type: mimeType });
    }
  }

  return {
    media: { images, files },
    remaining
  };
}
