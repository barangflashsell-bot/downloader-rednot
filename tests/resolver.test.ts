import { describe, it, expect } from 'vitest';
import { resolveRednoteUrl } from '../src/rednote/resolver';
import { RednoteResolveError, RednoteUnsupportedUrlError } from '../src/rednote/errors';

describe('RedNote URL Resolver', () => {
  it('should return destination directly when there is no redirect (HTTP 200)', async () => {
    const mockFetch = async () =>
      new Response(null, { status: 200 });

    const result = await resolveRednoteUrl('https://www.xiaohongshu.com/explore/12345', {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result).toBe('https://www.xiaohongshu.com/explore/12345');
  });

  it('should successfully resolve xhslink.com short URL to canonical xiaohongshu.com URL', async () => {
    const mockFetch = async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('xhslink.com')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://www.xiaohongshu.com/explore/targetNoteId123' },
        });
      }
      return new Response(null, { status: 200 });
    };

    const result = await resolveRednoteUrl('https://xhslink.com/shortCode', {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result).toBe('https://www.xiaohongshu.com/explore/targetNoteId123');
  });

  it('should reject redirect chain exceeding MAX_REDIRECTS', async () => {
    let count = 0;
    const mockFetch = async () => {
      count += 1;
      return new Response(null, {
        status: 302,
        headers: { location: `https://www.xiaohongshu.com/explore/step${count}` },
      });
    };

    await expect(
      resolveRednoteUrl('https://xhslink.com/loop', {
        maxRedirects: 3,
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(RednoteResolveError);
  });

  it('should reject redirect to an untrusted external domain', async () => {
    const mockFetch = async () => {
      return new Response(null, {
        status: 302,
        headers: { location: 'https://evil-phishing-site.com/steal' },
      });
    };

    await expect(
      resolveRednoteUrl('https://xhslink.com/evil', {
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(RednoteUnsupportedUrlError);
  });

  it('should throw RednoteResolveError on network timeout', async () => {
    const mockFetch = async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };

    await expect(
      resolveRednoteUrl('https://xhslink.com/timeout', {
        timeoutMs: 50,
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(RednoteResolveError);
  });
});
