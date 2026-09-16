import { describe, it, expect } from 'vitest';
import { generateStorageKey, sanitizePostId } from '../src/storage/storage';
import { MemoryStorageAdapter } from './mocks/memory-storage';
import { VercelBlobStorageAdapter } from '../src/storage/vercel-blob';

describe('Storage Key Generator and Sanitization', () => {
  it('should generate deterministic safe storage key for video', () => {
    const key1 = generateStorageKey({
      postId: '65a000000000000001000001',
      mediaUrl: 'https://sns-video-qc.xhscdn.com/stream/v1/video.mp4',
      mimeType: 'video/mp4',
    });

    const key2 = generateStorageKey({
      postId: '65a000000000000001000001',
      mediaUrl: 'https://sns-video-qc.xhscdn.com/stream/v1/video.mp4',
      mimeType: 'video/mp4',
    });

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^rednote\/65a000000000000001000001\/[a-f0-9]{32}\.mp4$/);
  });

  it('should generate safe storage key for image', () => {
    const key = generateStorageKey({
      postId: 'note123',
      mediaUrl: 'https://sns-webpic-qc.xhscdn.com/img.jpg',
      mimeType: 'image/jpeg',
    });

    expect(key).toMatch(/^rednote\/note123\/[a-f0-9]{32}\.jpg$/);
  });

  it('should sanitize path traversal attempts in post ID', () => {
    expect(sanitizePostId('../../etc/passwd')).toBe('etc_passwd');
    expect(sanitizePostId('..\\..\\windows\\system32')).toBe('windows_system32');
    expect(sanitizePostId('/root/secret')).toBe('root_secret');
    expect(sanitizePostId('postId\0withNull')).toBe('postIdwithNull');
    expect(sanitizePostId('')).toBe('unknown');

    const safeKey = generateStorageKey({
      postId: '../../dangerous/path',
      mediaUrl: 'https://sns-webpic-qc.xhscdn.com/photo.png',
      mimeType: 'image/png',
    });

    expect(safeKey.includes('..')).toBe(false);
    expect(safeKey.startsWith('rednote/dangerous_path/')).toBe(true);
  });
});

describe('MemoryStorageAdapter (Test Implementation)', () => {
  it('should upload buffer and verify object existence', async () => {
    const storage = new MemoryStorageAdapter();
    const testBuffer = Buffer.from('test media content');

    const result = await storage.upload('rednote/test/file.mp4', testBuffer, {
      contentType: 'video/mp4',
    });

    expect(result.storageKey).toBe('rednote/test/file.mp4');
    expect(result.publicUrl).toBe('https://blob.vercel-storage.com/mock-store/rednote/test/file.mp4');

    const exists = await storage.exists('rednote/test/file.mp4');
    expect(exists).toBe(true);

    const nonExistent = await storage.exists('rednote/missing/file.mp4');
    expect(nonExistent).toBe(false);
  });

  it('should support manual deletion without automatic deletion', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.upload('rednote/manual/file.jpg', Buffer.from('img'), {
      contentType: 'image/jpeg',
    });

    expect(await storage.exists('rednote/manual/file.jpg')).toBe(true);

    // Manual delete operation
    await storage.delete('rednote/manual/file.jpg');
    expect(await storage.exists('rednote/manual/file.jpg')).toBe(false);
  });
});

describe('VercelBlobStorageAdapter', () => {
  it('should throw error when BLOB_READ_WRITE_TOKEN is missing', async () => {
    const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const adapter = new VercelBlobStorageAdapter('');
    await expect(adapter.upload('test.mp4', Buffer.from('data'))).rejects.toThrow(
      /BLOB_READ_WRITE_TOKEN/
    );

    if (originalToken) {
      process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    }
  });
});
