import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { extractRednote } from '../src/rednote/extractor';
import {
  RednoteInvalidUrlError,
  RednoteAccessError,
  RednoteNetworkError,
} from '../src/rednote/errors';

describe('RedNote Extractor Flow', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const sampleVideoHtml = fs.readFileSync(path.join(fixturesDir, 'rednote-video.html'), 'utf-8');

  it('should throw RednoteInvalidUrlError for non-RedNote URLs', async () => {
    await expect(extractRednote('https://google.com')).rejects.toThrow(
      RednoteInvalidUrlError
    );
    await expect(extractRednote('not-a-url')).rejects.toThrow(
      RednoteInvalidUrlError
    );
  });

  it('should resolve short URL, fetch public page, and return RednotePost', async () => {
    const mockFetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = url.toString();

      // Short URL resolver HEAD call
      if (init?.method === 'HEAD' && urlStr.includes('xhslink.com')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://www.xiaohongshu.com/explore/65a000000000000001000001' },
        });
      }

      // Canonical page HEAD call
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200 });
      }

      // GET HTML call
      return new Response(sampleVideoHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    };

    const post = await extractRednote('https://xhslink.com/sampleCode', {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(post).toBeDefined();
    expect(post.id).toBe('65a000000000000001000001');
    expect(post.title).toBe('Tutorial Masak Enak');
    expect(post.media.length).toBe(1);
    expect(post.media[0].type).toBe('video');
    expect(post.media[0].url).toBe('https://sns-video-qc.xhscdn.com/stream/v1/video.mp4');
  });

  it('should throw RednoteAccessError on 401/403 status', async () => {
    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    };

    await expect(
      extractRednote('https://www.xiaohongshu.com/explore/private123', {
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(RednoteAccessError);
  });

  it('should throw RednoteAccessError on 404 status', async () => {
    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    };

    await expect(
      extractRednote('https://www.xiaohongshu.com/explore/deleted123', {
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(RednoteAccessError);
  });

  it('should throw RednoteAccessError when anti-bot CAPTCHA page is detected', async () => {
    const captchaHtml = `
      <html>
        <body>
          <div class="verify_slider">Please verify you are human</div>
        </body>
      </html>
    `;

    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200 });
      }
      return new Response(captchaHtml, { status: 200 });
    };

    await expect(
      extractRednote('https://www.xiaohongshu.com/explore/botBlock123', {
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(RednoteAccessError);
  });

  it('should throw RednoteNetworkError on server error (HTTP 500)', async () => {
    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200 });
      }
      return new Response('Internal Server Error', { status: 500, statusText: 'Server Error' });
    };

    await expect(
      extractRednote('https://www.xiaohongshu.com/explore/error500', {
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(RednoteNetworkError);
  });
});
