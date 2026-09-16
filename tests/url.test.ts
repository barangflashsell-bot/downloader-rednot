import { describe, it, expect } from 'vitest';
import { isRednoteUrl, extractRednoteUrl } from '../src/utils/url';

describe('isRednoteUrl', () => {
  it('should accept valid https://www.xiaohongshu.com URLs', () => {
    expect(isRednoteUrl('https://www.xiaohongshu.com/explore/abc')).toBe(true);
  });

  it('should accept valid https://xiaohongshu.com URLs', () => {
    expect(isRednoteUrl('https://xiaohongshu.com/explore/abc')).toBe(true);
  });

  it('should accept valid https://xhslink.com URLs', () => {
    expect(isRednoteUrl('https://xhslink.com/abc')).toBe(true);
  });

  it('should accept valid https://www.xhslink.com URLs', () => {
    expect(isRednoteUrl('https://www.xhslink.com/abc')).toBe(true);
  });

  it('should reject insecure http protocol', () => {
    expect(isRednoteUrl('http://www.xiaohongshu.com/explore/abc')).toBe(false);
  });

  it('should reject non-RedNote domains', () => {
    expect(isRednoteUrl('https://google.com')).toBe(false);
  });

  it('should reject URLs where RedNote is just a query parameter', () => {
    expect(isRednoteUrl('https://example.com/?url=https://xiaohongshu.com')).toBe(false);
  });

  it('should reject spoofed or phishing domains', () => {
    expect(isRednoteUrl('https://evil-xiaohongshu.com/explore/abc')).toBe(false);
  });

  it('should reject non-URL strings and empty input', () => {
    expect(isRednoteUrl('')).toBe(false);
    expect(isRednoteUrl('hello world')).toBe(false);
    expect(isRednoteUrl('ftp://xiaohongshu.com')).toBe(false);
  });
});

describe('extractRednoteUrl', () => {
  it('should extract direct URL when provided alone', () => {
    const direct = 'https://www.xiaohongshu.com/explore/65a000000000000001000001';
    expect(extractRednoteUrl(direct)).toBe(direct);
  });

  it('should extract valid URL embedded in user share message text', () => {
    const text = 'Lihat video ini di RedNote: https://www.xiaohongshu.com/explore/12345 keren banget!';
    expect(extractRednoteUrl(text)).toBe('https://www.xiaohongshu.com/explore/12345');
  });

  it('should strip trailing punctuation from extracted URL', () => {
    const text = 'Cek link ini: https://xhslink.com/abc.';
    expect(extractRednoteUrl(text)).toBe('https://xhslink.com/abc');
  });

  it('should return null when no valid RedNote URL is present', () => {
    expect(extractRednoteUrl('Hello world no links')).toBeNull();
    expect(extractRednoteUrl('Check https://youtube.com/watch?v=123')).toBeNull();
  });

  it('should extract and upgrade http://xhslink.com/o/... links', () => {
    expect(extractRednoteUrl('http://xhslink.com/o/Awfz0NZ6meK')).toBe(
      'https://xhslink.com/o/Awfz0NZ6meK'
    );
    expect(
      extractRednoteUrl('Lihat video ini http://xhslink.com/o/Awfz0NZ6meK keren')
    ).toBe('https://xhslink.com/o/Awfz0NZ6meK');
  });
});

