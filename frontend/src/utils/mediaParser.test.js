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
