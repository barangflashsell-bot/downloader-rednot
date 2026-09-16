import { describe, it, expect } from 'vitest';
import { validateMediaUrl } from '../src/rednote/media-validator';

describe('Media Validator (Security & Allowlist)', () => {
  it('should allow valid HTTPS RedNote / Xiaohongshu media CDN domains', () => {
    expect(validateMediaUrl('https://www.xiaohongshu.com/photo.jpg')).toBe(true);
    expect(validateMediaUrl('https://xiaohongshu.com/media/test.mp4')).toBe(true);
    expect(validateMediaUrl('https://rednote.com/asset.jpg')).toBe(true);
    expect(validateMediaUrl('https://sns-video-qc.xhscdn.com/video/123.mp4')).toBe(true);
    expect(validateMediaUrl('https://sns-webpic-qc.xhscdn.com/img/123.jpg')).toBe(true);
    expect(validateMediaUrl('https://ci.xiaohongshu.com/photo.jpg')).toBe(true);
  });

  it('should reject non-media domains like xhslink.com for media files', () => {
    expect(validateMediaUrl('https://xhslink.com/photo.jpg')).toBe(false);
    expect(validateMediaUrl('https://www.xhslink.com/video.mp4')).toBe(false);
  });

  it('should reject javascript: pseudo-protocol', () => {
    expect(validateMediaUrl('javascript:https://www.xiaohongshu.com')).toBe(false);
    expect(validateMediaUrl('javascript:alert(1)')).toBe(false);
  });

  it('should reject data: URLs', () => {
    expect(validateMediaUrl('data:text/html,<h1>Hello</h1>')).toBe(false);
    expect(validateMediaUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
  });

  it('should reject localhost and 127.0.0.1 (SSRF prevention)', () => {
    expect(validateMediaUrl('http://localhost')).toBe(false);
    expect(validateMediaUrl('https://localhost')).toBe(false);
    expect(validateMediaUrl('http://127.0.0.1')).toBe(false);
    expect(validateMediaUrl('https://127.0.0.1')).toBe(false);
    expect(validateMediaUrl('https://127.0.0.1:8080/exploit')).toBe(false);
    expect(validateMediaUrl('https://10.0.0.1/secret')).toBe(false);
    expect(validateMediaUrl('https://192.168.1.1/admin')).toBe(false);
    expect(validateMediaUrl('https://0.0.0.0/test.mp4')).toBe(false);
    expect(validateMediaUrl('https://[::1]/test.mp4')).toBe(false);
    expect(validateMediaUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
  });

  it('should reject unauthorized external domains', () => {
    expect(validateMediaUrl('https://evil-example.com')).toBe(false);
    expect(validateMediaUrl('https://google.com/test.mp4')).toBe(false);
  });

  it('should reject spoofed or lookalike domain attacks', () => {
    expect(validateMediaUrl('https://evil-xiaohongshu.com')).toBe(false);
    expect(validateMediaUrl('https://evil-xiaohongshu.com/video.mp4')).toBe(false);
    expect(validateMediaUrl('https://fake-xhscdn.com/video.mp4')).toBe(false);
    expect(validateMediaUrl('https://fakexhscdn.com/image.jpg')).toBe(false);
    expect(validateMediaUrl('https://xiaohongshu.com.evil.com/video.mp4')).toBe(false);
    expect(validateMediaUrl('https://xhscdn.com.attacker.com/image.jpg')).toBe(false);
  });

  it('should reject insecure HTTP protocol', () => {
    expect(validateMediaUrl('http://sns-video-qc.xhscdn.com/video.mp4')).toBe(false);
    expect(validateMediaUrl('http://www.xiaohongshu.com/explore/123')).toBe(false);
  });

  it('should reject empty or malformed strings', () => {
    expect(validateMediaUrl('')).toBe(false);
    expect(validateMediaUrl('not-a-url')).toBe(false);
  });
});
