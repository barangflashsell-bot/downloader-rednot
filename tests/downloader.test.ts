import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { downloadAndStoreMedia } from '../src/downloader/download';
import { MemoryStorageAdapter } from './mocks/memory-storage';
import {
  RednoteFileTooLargeError,
  RednoteInvalidContentTypeError,
  RednoteDownloadRedirectError,
  RednoteDownloadNetworkError,
  RednoteStorageError,
} from '../src/downloader/errors';

describe('Media Downloader (Streaming, Validation, Security & Storage)', () => {
  let memoryStorage: MemoryStorageAdapter;
  let testTempDir: string;

  beforeEach(() => {
    memoryStorage = new MemoryStorageAdapter();
    testTempDir = path.join(os.tmpdir(), `test_downloader_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(testTempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  // Helper to create a Web ReadableStream from a buffer
  function createStreamFromBuffer(buffer: Buffer): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      },
    });
  }

  // 1. Valid MP4 download
  it('1. should successfully stream and download valid MP4 video and store in persistent storage', async () => {
    const videoData = Buffer.from('fake mp4 video stream bytes header ...');
    const mockFetch = async () => {
      return new Response(createStreamFromBuffer(videoData), {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(videoData.length),
        },
      });
    };

    const result = await downloadAndStoreMedia(
      'https://sns-video-qc.xhscdn.com/stream/v1/valid_video.mp4',
      { postId: 'post101', expectedType: 'video' },
      {
        storageAdapter: memoryStorage,
        fetchFn: mockFetch as unknown as typeof fetch,
        tempDir: testTempDir,
      }
    );

    expect(result.success).toBe(true);
    expect(result.mediaType).toBe('video');
    expect(result.mimeType).toBe('video/mp4');
    expect(result.size).toBe(videoData.length);
    expect(result.deliveryMode).toBe('telegram');
    expect(result.storageKey.startsWith('rednote/post101/')).toBe(true);
    expect(await memoryStorage.exists(result.storageKey)).toBe(true);
  });

  // 2. Valid image download
  it('2. should successfully download and store valid JPEG image', async () => {
    const imageData = Buffer.from('fake jpeg image binary data');
    const mockFetch = async () => {
      return new Response(createStreamFromBuffer(imageData), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': String(imageData.length),
        },
      });
    };

    const result = await downloadAndStoreMedia(
      'https://sns-webpic-qc.xhscdn.com/img102.jpg',
      { postId: 'post102', expectedType: 'image' },
      {
        storageAdapter: memoryStorage,
        fetchFn: mockFetch as unknown as typeof fetch,
        tempDir: testTempDir,
      }
    );

    expect(result.success).toBe(true);
    expect(result.mediaType).toBe('image');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.size).toBe(imageData.length);
    expect(await memoryStorage.exists(result.storageKey)).toBe(true);
  });

  // 3. Content-Length too large
  it('3. should reject download before streaming if Content-Length header exceeds limit', async () => {
    const mockFetch = async () => {
      return new Response(createStreamFromBuffer(Buffer.from('small')), {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(100 * 1024 * 1024), // 100 MB declared
        },
      });
    };

    await expect(
      downloadAndStoreMedia(
        'https://sns-video-qc.xhscdn.com/huge.mp4',
        { postId: 'postHuge' },
        {
          maxSizeBytes: 50 * 1024 * 1024, // 50 MB limit
          storageAdapter: memoryStorage,
          fetchFn: mockFetch as unknown as typeof fetch,
          tempDir: testTempDir,
        }
      )
    ).rejects.toThrow(RednoteFileTooLargeError);
  });

  // 4. Streaming exceeds limit
  it('4. should abort immediately during streaming when chunk bytes exceed max size', async () => {
    const chunk1 = Buffer.alloc(600);
    const chunk2 = Buffer.alloc(600); // total 1200 bytes > 1000 bytes limit

    const multiChunkStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(chunk1));
        controller.enqueue(new Uint8Array(chunk2));
        controller.close();
      },
    });

    const mockFetch = async () => {
      return new Response(multiChunkStream, {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          // No content-length header provided by server
        },
      });
    };

    await expect(
      downloadAndStoreMedia(
        'https://sns-video-qc.xhscdn.com/overflow.mp4',
        { postId: 'postOverflow' },
        {
          maxSizeBytes: 1000, // 1000 bytes limit
          storageAdapter: memoryStorage,
          fetchFn: mockFetch as unknown as typeof fetch,
          tempDir: testTempDir,
        }
      )
    ).rejects.toThrow(RednoteFileTooLargeError);
  });

  // 5. Invalid Content-Type
  it('5. should reject unsupported media Content-Type (e.g. application/pdf)', async () => {
    const mockFetch = async () => {
      return new Response(createStreamFromBuffer(Buffer.from('%PDF-1.4')), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      });
    };

    await expect(
      downloadAndStoreMedia(
        'https://sns-video-qc.xhscdn.com/doc.pdf',
        { postId: 'postDoc' },
        {
          storageAdapter: memoryStorage,
          fetchFn: mockFetch as unknown as typeof fetch,
          tempDir: testTempDir,
        }
      )
    ).rejects.toThrow(RednoteInvalidContentTypeError);
  });

  // 6. HTML pretending to be video
  it('6. should reject HTML error/WAF response pretending to be video', async () => {
    const htmlError = '<html><body><h1>404 Not Found or CAPTCHA</h1></body></html>';
    const mockFetch = async () => {
      return new Response(createStreamFromBuffer(Buffer.from(htmlError)), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    };

    await expect(
      downloadAndStoreMedia(
        'https://sns-video-qc.xhscdn.com/fake_video.mp4',
        { postId: 'postFake' },
        {
          storageAdapter: memoryStorage,
          fetchFn: mockFetch as unknown as typeof fetch,
          tempDir: testTempDir,
        }
      )
    ).rejects.toThrow(RednoteInvalidContentTypeError);
  });

  // 7. Invalid hostname (SSRF protection)
  it('7. should reject invalid or localhost hostname upfront (SSRF prevention)', async () => {
    await expect(
      downloadAndStoreMedia('http://localhost:8080/video.mp4', {}, { storageAdapter: memoryStorage })
    ).rejects.toThrow(RednoteDownloadRedirectError);

    await expect(
      downloadAndStoreMedia('https://127.0.0.1/video.mp4', {}, { storageAdapter: memoryStorage })
    ).rejects.toThrow(RednoteDownloadRedirectError);

    await expect(
      downloadAndStoreMedia('https://evil-unauthorized-domain.com/video.mp4', {}, { storageAdapter: memoryStorage })
    ).rejects.toThrow(RednoteDownloadRedirectError);
  });

  // 8. Redirect to unauthorized host
  it('8. should reject redirect leading to an unauthorized or SSRF host', async () => {
    const mockFetch = async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('initial')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://169.254.169.254/secret.mp4' },
        });
      }
      return new Response(createStreamFromBuffer(Buffer.from('ok')), { status: 200 });
    };

    await expect(
      downloadAndStoreMedia(
        'https://sns-video-qc.xhscdn.com/initial.mp4',
        { postId: 'postRedirectEvil' },
        {
          storageAdapter: memoryStorage,
          fetchFn: mockFetch as unknown as typeof fetch,
          tempDir: testTempDir,
        }
      )
    ).rejects.toThrow(RednoteDownloadRedirectError);
  });

  // 9. Redirect limit exceeded
  it('9. should reject redirect chain exceeding maxRedirects', async () => {
    let hop = 0;
    const mockFetch = async () => {
      hop += 1;
      return new Response(null, {
        status: 302,
        headers: { location: `https://sns-video-qc.xhscdn.com/hop${hop}.mp4` },
      });
    };

    await expect(
      downloadAndStoreMedia(
        'https://sns-video-qc.xhscdn.com/loop.mp4',
        { postId: 'postLoop' },
        {
          maxRedirects: 3,
          storageAdapter: memoryStorage,
          fetchFn: mockFetch as unknown as typeof fetch,
          tempDir: testTempDir,
        }
      )
    ).rejects.toThrow(RednoteDownloadRedirectError);
  });

  // 10. Network timeout
  it('10. should throw RednoteDownloadNetworkError when media fetch times out', async () => {
    const mockFetch = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };

    await expect(
      downloadAndStoreMedia(
        'https://sns-video-qc.xhscdn.com/timeout.mp4',
        { postId: 'postTimeout' },
        {
          timeoutMs: 50,
          retries: 0,
          storageAdapter: memoryStorage,
          fetchFn: mockFetch as unknown as typeof fetch,
          tempDir: testTempDir,
        }
      )
    ).rejects.toThrow(RednoteDownloadNetworkError);
  });

  // 11. Partial download cleanup
  it('11. should reliably delete temporary files on download failure leaving no orphaned .tmp files', async () => {
    const mockFetch = async () => {
      // Simulate network drop mid-stream
      const failingStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(Buffer.from('chunk1')));
          controller.error(new Error('Network connection drop'));
        },
      });

      return new Response(failingStream, {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      });
    };

    await expect(
      downloadAndStoreMedia(
        'https://sns-video-qc.xhscdn.com/partial.mp4',
        { postId: 'postPartial' },
        {
          retries: 0,
          storageAdapter: memoryStorage,
          fetchFn: mockFetch as unknown as typeof fetch,
          tempDir: testTempDir,
        }
      )
    ).rejects.toThrow(RednoteDownloadNetworkError);

    // Verify temp directory contains no leftover .tmp files
    const leftoverFiles = fs.readdirSync(testTempDir);
    expect(leftoverFiles.length).toBe(0);
  });

  // 12. Storage upload failure
  it('12. should throw RednoteStorageError when persistent storage upload fails', async () => {
    const failingStorage: MemoryStorageAdapter = {
      ...memoryStorage,
      upload: async (_key, stream) => {
        if (stream && typeof (stream as { destroy?: () => void }).destroy === 'function') {
          (stream as { destroy: () => void }).destroy();
        }
        throw new Error('Blob upload connection refused');
      },
      exists: async () => false,
      getUrl: async () => '',
      delete: async () => {},
    };

    const mockFetch = async () => {
      return new Response(createStreamFromBuffer(Buffer.from('video data')), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      });
    };

    await expect(
      downloadAndStoreMedia(
        'https://sns-video-qc.xhscdn.com/upload_fail.mp4',
        { postId: 'postUploadFail' },
        {
          retries: 0,
          storageAdapter: failingStorage,
          fetchFn: mockFetch as unknown as typeof fetch,
          tempDir: testTempDir,
        }
      )
    ).rejects.toThrow(RednoteStorageError);
  });

  // 13. Duplicate/existing object
  it('13. should return existing stored media without re-downloading when object exists', async () => {
    let fetchCallCount = 0;
    const mediaBuffer = Buffer.from('video once');

    const mockFetch = async () => {
      fetchCallCount += 1;
      return new Response(createStreamFromBuffer(mediaBuffer), {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(mediaBuffer.length),
        },
      });
    };

    const mediaUrl = 'https://sns-video-qc.xhscdn.com/cached.mp4';

    // First download
    const res1 = await downloadAndStoreMedia(
      mediaUrl,
      { postId: 'postCache', expectedMimeType: 'video/mp4' },
      {
        storageAdapter: memoryStorage,
        fetchFn: mockFetch as unknown as typeof fetch,
        tempDir: testTempDir,
      }
    );
    expect(fetchCallCount).toBe(1);

    // Second call with same media
    const res2 = await downloadAndStoreMedia(
      mediaUrl,
      { postId: 'postCache', expectedMimeType: 'video/mp4' },
      {
        storageAdapter: memoryStorage,
        fetchFn: mockFetch as unknown as typeof fetch,
        tempDir: testTempDir,
      }
    );

    // Should NOT call fetch again!
    expect(fetchCallCount).toBe(1);
    expect(res2.storageKey).toBe(res1.storageKey);
    expect(res2.publicUrl).toBe(res1.publicUrl);
  });

  // 14. Safe object key
  it('14. should construct deterministic and collision-safe storage keys', async () => {
    const mockFetch = async () => {
      return new Response(createStreamFromBuffer(Buffer.from('img data')), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    };

    const result = await downloadAndStoreMedia(
      'https://sns-webpic-qc.xhscdn.com/key_test.png',
      { postId: 'myPost99' },
      {
        storageAdapter: memoryStorage,
        fetchFn: mockFetch as unknown as typeof fetch,
        tempDir: testTempDir,
      }
    );

    expect(result.storageKey).toMatch(/^rednote\/myPost99\/[a-f0-9]{32}\.png$/);
  });

  // 15. Path traversal attempt in post ID
  it('15. should sanitize path traversal characters in post ID before generating storage key', async () => {
    const mockFetch = async () => {
      return new Response(createStreamFromBuffer(Buffer.from('img data')), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    };

    const result = await downloadAndStoreMedia(
      'https://sns-webpic-qc.xhscdn.com/traversal_test.jpg',
      { postId: '../../../etc/passwd' },
      {
        storageAdapter: memoryStorage,
        fetchFn: mockFetch as unknown as typeof fetch,
        tempDir: testTempDir,
      }
    );

    expect(result.storageKey.includes('..')).toBe(false);
    expect(result.storageKey.startsWith('rednote/etc_passwd/')).toBe(true);
  });

  // 16. No automatic deletion
  it('16. should verify persistent storage retains uploaded objects without any auto-delete', async () => {
    const mockFetch = async () => {
      return new Response(createStreamFromBuffer(Buffer.from('persistent video')), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      });
    };

    const result = await downloadAndStoreMedia(
      'https://sns-video-qc.xhscdn.com/persistent.mp4',
      { postId: 'postKeep' },
      {
        storageAdapter: memoryStorage,
        fetchFn: mockFetch as unknown as typeof fetch,
        tempDir: testTempDir,
      }
    );

    // Object exists and persists indefinitely
    expect(await memoryStorage.exists(result.storageKey)).toBe(true);
    const item = memoryStorage.getItem(result.storageKey);
    expect(item).toBeDefined();
    // No expiration field or TTL exists
    expect((item as unknown as { expiresAt?: unknown }).expiresAt).toBeUndefined();
  });
});
