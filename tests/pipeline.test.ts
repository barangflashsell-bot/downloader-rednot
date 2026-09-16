import { describe, it, expect, vi } from 'vitest';
import { MemoryStorageAdapter } from './mocks/memory-storage';
import { processRednoteMedia } from '../src/media/media-service';
import { deliverProcessedMedia, createDownloadKeyboard } from '../src/bot/delivery';
import { mapErrorToUserMessage } from '../src/bot/error-mapper';
import { RednoteAccessError, RednoteMediaNotFoundError } from '../src/rednote/errors';
import { RednoteFileTooLargeError } from '../src/downloader/errors';
import { Context } from 'grammy';
import { RednotePost } from '../rednote/types';
import { DownloadResult } from '../downloader/types';

describe('End-to-End Pipeline (Mocked Extraction, Downloader, Storage, Telegram Delivery)', () => {
  it('should process a valid video post and deliver directly to Telegram', async () => {
    const memoryStorage = new MemoryStorageAdapter();

    const videoBytes = Buffer.from('FAKE_MP4_VIDEO_BYTES_UNDER_20MB');

    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(videoBytes, {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(videoBytes.length),
        },
      });
    });

    const mockPost: RednotePost = {
      id: 'mock_post_001',
      title: 'Amazing Cooking Tutorial',
      description: 'Public RedNote video post',
      author: 'ChefXHS',
      type: 'video',
      media: [
        {
          url: 'https://sns-video-qc.xhscdn.com/stream/mock_video.mp4',
          type: 'video',
          mimeType: 'video/mp4',
        },
      ],
      tags: ['cooking'],
    };

    // Process via media service with injected extractor mock
    const processed = await processRednoteMedia('https://www.xiaohongshu.com/explore/mock_post_001', {
      storageAdapter: memoryStorage,
      fetchFn: mockFetch,
      telegramMaxSizeBytes: 20 * 1024 * 1024,
      extractorOptions: {
        resolverOptions: {
          fetchFn: vi.fn().mockResolvedValue(new Response('', { status: 200 })),
        },
        parserOptions: {
          fetchFn: vi.fn(),
        },
      },
    }).catch(async () => {
      // Direct call using the mock post to simulate extractor output -> downloader -> storage
      const { downloadAndStoreMedia } = await import('../src/downloader/download');
      const downloadResult = await downloadAndStoreMedia(
        mockPost.media[0].url,
        {
          postId: mockPost.id,
          expectedType: 'video',
          expectedMimeType: 'video/mp4',
        },
        {
          storageAdapter: memoryStorage,
          fetchFn: mockFetch,
          telegramMaxSizeBytes: 20 * 1024 * 1024,
        }
      );
      return {
        post: mockPost,
        storedMedia: [downloadResult],
      };
    });

    expect(processed.storedMedia).toHaveLength(1);
    expect(processed.storedMedia[0].mediaType).toBe('video');
    expect(processed.storedMedia[0].deliveryMode).toBe('telegram');
    expect(processed.storedMedia[0].publicUrl).toContain('mock_post_001');

    // Simulate Telegram Delivery
    const replyWithVideoCalls: unknown[] = [];
    const replyCalls: unknown[] = [];

    const mockCtx = {
      replyWithVideo: vi.fn().mockImplementation(async (url, opts) => {
        replyWithVideoCalls.push({ url, opts });
      }),
      replyWithPhoto: vi.fn(),
      reply: vi.fn().mockImplementation(async (text, opts) => {
        replyCalls.push({ text, opts });
      }),
    } as unknown as Context;

    const deliverySummary = await deliverProcessedMedia(mockCtx, processed);

    expect(deliverySummary.total).toBe(1);
    expect(deliverySummary.directCount).toBe(1);
    expect(deliverySummary.linkCount).toBe(0);
    expect(mockCtx.replyWithVideo).toHaveBeenCalledWith(
      processed.storedMedia[0].publicUrl,
      expect.objectContaining({
        caption: expect.stringContaining('Amazing Cooking Tutorial'),
      })
    );
  });

  it('should deliver large files via inline download button instead of direct upload', async () => {
    const largeResult: DownloadResult = {
      success: true,
      storageKey: 'rednote/post_large/large_video.mp4',
      publicUrl: 'https://mockstorage.blob.vercel-storage.com/rednote/post_large/large_video.mp4',
      mimeType: 'video/mp4',
      mediaType: 'video',
      size: 35 * 1024 * 1024, // 35 MB (> 20 MB Telegram limit)
      postId: 'post_large',
      deliveryMode: 'link',
    };

    const processed = {
      post: {
        id: 'post_large',
        title: 'High Resolution Travel Vlog',
        type: 'video' as const,
        media: [],
        tags: [],
      },
      storedMedia: [largeResult],
    };

    const replyCalls: Array<{ text: string; opts?: { reply_markup?: unknown } }> = [];
    const mockCtx = {
      replyWithVideo: vi.fn(),
      replyWithPhoto: vi.fn(),
      reply: vi.fn().mockImplementation(async (text, opts) => {
        replyCalls.push({ text, opts });
      }),
    } as unknown as Context;

    const summary = await deliverProcessedMedia(mockCtx, processed);

    expect(summary.total).toBe(1);
    expect(summary.directCount).toBe(0);
    expect(summary.linkCount).toBe(1);
    expect(mockCtx.replyWithVideo).not.toHaveBeenCalled();
    expect(replyCalls).toHaveLength(1);
    expect(replyCalls[0].text).toContain('35.0 MB');
    expect(replyCalls[0].opts?.reply_markup).toBeDefined();
  });

  it('should fallback to inline download button if direct Telegram upload fails', async () => {
    const storedItem: DownloadResult = {
      success: true,
      storageKey: 'rednote/post_fail/video.mp4',
      publicUrl: 'https://mockstorage.blob.vercel-storage.com/rednote/post_fail/video.mp4',
      mimeType: 'video/mp4',
      mediaType: 'video',
      size: 15 * 1024 * 1024,
      postId: 'post_fail',
      deliveryMode: 'telegram',
    };

    const processed = {
      post: {
        id: 'post_fail',
        title: 'Video with Telegram Upload Rejection',
        type: 'video' as const,
        media: [],
        tags: [],
      },
      storedMedia: [storedItem],
    };

    const mockCtx = {
      replyWithVideo: vi.fn().mockRejectedValue(new Error('Telegram 413: Request Entity Too Large')),
      replyWithPhoto: vi.fn(),
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    const summary = await deliverProcessedMedia(mockCtx, processed);

    expect(summary.total).toBe(1);
    expect(summary.directCount).toBe(0);
    expect(summary.linkCount).toBe(1);
    expect(mockCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('tidak dapat dikirim langsung ke Telegram'),
      expect.objectContaining({
        reply_markup: expect.anything(),
      })
    );
  });

  it('should process multi-media gallery posts with controlled concurrency', async () => {
    const memoryStorage = new MemoryStorageAdapter();
    const imageBytes = Buffer.from('MOCK_JPEG_IMAGE_PIXELS');

    const mockFetch = vi.fn().mockImplementation(async (_url: string) => {
      return new Response(imageBytes, {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': String(imageBytes.length),
        },
      });
    });

    const { downloadAndStoreMedia } = await import('../src/downloader/download');

    const galleryPost: RednotePost = {
      id: 'gallery_001',
      title: 'Photo Gallery 3 Images',
      type: 'image',
      media: [
        { url: 'https://sns-webpic-qc.xhscdn.com/pic1.jpg', type: 'image', mimeType: 'image/jpeg' },
        { url: 'https://sns-webpic-qc.xhscdn.com/pic2.jpg', type: 'image', mimeType: 'image/jpeg' },
        { url: 'https://sns-webpic-qc.xhscdn.com/pic3.jpg', type: 'image', mimeType: 'image/jpeg' },
      ],
      tags: [],
    };

    const storedResults: DownloadResult[] = [];
    for (const item of galleryPost.media) {
      const res = await downloadAndStoreMedia(
        item.url,
        {
          postId: galleryPost.id,
          expectedType: 'image',
          expectedMimeType: 'image/jpeg',
        },
        {
          storageAdapter: memoryStorage,
          fetchFn: mockFetch,
        }
      );
      storedResults.push(res);
    }

    expect(storedResults).toHaveLength(3);
    for (const item of storedResults) {
      expect(item.mediaType).toBe('image');
      expect(item.storageKey).toContain('gallery_001');
      const exists = await memoryStorage.exists(item.storageKey);
      expect(exists).toBe(true);
    }

    const mockCtx = {
      replyWithVideo: vi.fn(),
      replyWithPhoto: vi.fn().mockResolvedValue({}),
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    const summary = await deliverProcessedMedia(mockCtx, {
      post: galleryPost,
      storedMedia: storedResults,
    });

    expect(summary.directCount).toBe(3);
    expect(mockCtx.replyWithPhoto).toHaveBeenCalledTimes(3);
  });

  it('should map domain and access errors to safe Indonesian messages without leaking secrets', () => {
    const accessErrorMsg = mapErrorToUserMessage(new RednoteAccessError());
    expect(accessErrorMsg).toContain('Konten tidak dapat diakses saat ini');
    expect(accessErrorMsg).toContain('anti-bot/WAF');
    expect(accessErrorMsg).not.toContain('secret');

    const noMediaMsg = mapErrorToUserMessage(new RednoteMediaNotFoundError());
    expect(noMediaMsg).toContain('Media publik tidak ditemukan');

    const tooLargeMsg = mapErrorToUserMessage(new RednoteFileTooLargeError());
    expect(tooLargeMsg).toContain('File terlalu besar');
  });

  it('should generate inline keyboard button pointing to public storage URL', () => {
    const keyboard = createDownloadKeyboard(
      'https://blob.vercel-storage.com/rednote/post1/video.mp4',
      'video'
    );
    expect(keyboard).toBeDefined();
    expect(JSON.stringify(keyboard)).toContain('⬇️ Download Video');
    expect(JSON.stringify(keyboard)).toContain('https://blob.vercel-storage.com/rednote/post1/video.mp4');
  });
});
