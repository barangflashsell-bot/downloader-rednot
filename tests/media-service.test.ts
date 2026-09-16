import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { processRednoteMedia } from '../src/media/media-service';
import { MemoryStorageAdapter } from './mocks/memory-storage';
import { RednoteAccessError, RednoteMediaNotFoundError } from '../src/rednote/errors';

describe('Media Service Layer (Telegram Ready)', () => {
  let memoryStorage: MemoryStorageAdapter;
  let testTempDir: string;

  beforeEach(() => {
    memoryStorage = new MemoryStorageAdapter();
    testTempDir = path.join(os.tmpdir(), `test_service_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(testTempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  function createStreamFromBuffer(buffer: Buffer): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      },
    });
  }

  it('should extract metadata and download media into storage successfully', async () => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    const sampleVideoHtml = fs.readFileSync(path.join(fixturesDir, 'rednote-video.html'), 'utf-8');
    const videoData = Buffer.from('mock video bytes for service test');

    const mockFetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = url.toString();

      // Extractor resolver HEAD call
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200 });
      }

      // Extractor HTML fetch
      if (urlStr.includes('xiaohongshu.com/explore')) {
        return new Response(sampleVideoHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }

      // Downloader media GET call
      if (urlStr.includes('xhscdn.com')) {
        return new Response(createStreamFromBuffer(videoData), {
          status: 200,
          headers: {
            'content-type': 'video/mp4',
            'content-length': String(videoData.length),
          },
        });
      }

      return new Response('Not Found', { status: 404 });
    };

    const result = await processRednoteMedia('https://www.xiaohongshu.com/explore/65a000000000000001000001', {
      storageAdapter: memoryStorage,
      fetchFn: mockFetch as unknown as typeof fetch,
      tempDir: testTempDir,
      extractorOptions: {
        fetchFn: mockFetch as unknown as typeof fetch,
      },
    });

    expect(result.post).toBeDefined();
    expect(result.post.title).toBe('Tutorial Masak Enak');
    expect(result.storedMedia.length).toBe(1);
    expect(result.storedMedia[0].success).toBe(true);
    expect(result.storedMedia[0].mediaType).toBe('video');
    expect(result.storedMedia[0].deliveryMode).toBe('telegram');
    expect(await memoryStorage.exists(result.storedMedia[0].storageKey)).toBe(true);
  });

  it('should propagate extractor WAF/Access errors honestly without faking success', async () => {
    const mockFetch = async () => {
      return new Response('Forbidden', { status: 403 });
    };

    await expect(
      processRednoteMedia('https://www.xiaohongshu.com/explore/blockedPost', {
        storageAdapter: memoryStorage,
        tempDir: testTempDir,
        extractorOptions: {
          fetchFn: mockFetch as unknown as typeof fetch,
        },
      })
    ).rejects.toThrow(RednoteAccessError);
  });

  it('should propagate extractor MediaNotFoundError honestly', async () => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    const noMediaHtml = fs.readFileSync(path.join(fixturesDir, 'rednote-no-media.html'), 'utf-8');

    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      return new Response(noMediaHtml, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    };

    await expect(
      processRednoteMedia('https://www.xiaohongshu.com/explore/emptyPost', {
        storageAdapter: memoryStorage,
        tempDir: testTempDir,
        extractorOptions: {
          fetchFn: mockFetch as unknown as typeof fetch,
        },
      })
    ).rejects.toThrow(RednoteMediaNotFoundError);
  });
});
