import {
  RednoteInvalidUrlError,
  RednoteUnsupportedUrlError,
  RednoteResolveError,
} from './errors';

const ALLOWED_RESOLVER_HOSTS = new Set([
  'xiaohongshu.com',
  'www.xiaohongshu.com',
  'xhslink.com',
  'www.xhslink.com',
  'rednote.com',
  'www.rednote.com',
]);

export interface ResolverOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Validates whether a URL's protocol is HTTPS and domain is an authorized RedNote domain.
 */
function validateResolverUrl(urlStr: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    throw new RednoteInvalidUrlError(`Malformed URL: ${urlStr}`);
  }

  // Securely upgrade to HTTPS if an authorized RedNote server redirects via http
  if (parsed.protocol === 'http:' && ALLOWED_RESOLVER_HOSTS.has(parsed.hostname.toLowerCase())) {
    parsed.protocol = 'https:';
  }

  if (parsed.protocol !== 'https:') {
    throw new RednoteUnsupportedUrlError('Only HTTPS protocol is supported for RedNote URLs.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_RESOLVER_HOSTS.has(hostname)) {
    throw new RednoteUnsupportedUrlError(`Unauthorized domain: ${hostname}`);
  }

  return parsed;
}

/**
 * Resolves short RedNote URLs (such as xhslink.com) to the final canonical URL.
 * Strictly adheres to HTTPS, hostname allowlist, timeout, and redirect count limits.
 *
 * @param url - Input URL to resolve
 * @param options - Custom resolver options (timeout, max redirects, fetch implementation)
 * @returns Final resolved canonical URL
 */
export async function resolveRednoteUrl(
  url: string,
  options?: ResolverOptions
): Promise<string> {
  const maxRedirects = options?.maxRedirects ?? Number(process.env.MAX_REDIRECTS || 5);
  const timeoutMs = options?.timeoutMs ?? Number(process.env.REQUEST_TIMEOUT_MS || 15000);
  const fetchImpl = options?.fetchFn ?? fetch;

  let currentUrl = url.trim();
  validateResolverUrl(currentUrl);

  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[REDNOTE] Resolving URL: ${currentUrl}`);

      const response = await fetchImpl(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      // If status is a redirect (301, 302, 303, 307, 308)
      if (
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308
      ) {
        const location = response.headers.get('location');
        if (!location) {
          throw new RednoteResolveError('Redirect response received without Location header.');
        }

        // Resolve relative or absolute redirect location
        const nextUrlObj = new URL(location, currentUrl);
        const nextUrl = nextUrlObj.toString();

        // Validate the redirected URL against allowed hosts and HTTPS
        const validatedUrlObj = validateResolverUrl(nextUrl);

        redirectCount += 1;
        if (redirectCount > maxRedirects) {
          throw new RednoteResolveError(
            `Exceeded maximum allowed redirects (${maxRedirects}).`
          );
        }

        currentUrl = validatedUrlObj.toString();
        continue;
      }

      // If status is 200 or any non-redirect, we reached the destination
      return currentUrl;
    } catch (err: unknown) {
      if (err instanceof RednoteResolveError || err instanceof RednoteUnsupportedUrlError || err instanceof RednoteInvalidUrlError) {
        throw err;
      }

      if (err instanceof Error && err.name === 'AbortError') {
        throw new RednoteResolveError(`URL resolution timed out after ${timeoutMs}ms.`);
      }

      throw new RednoteResolveError(
        `Failed to resolve RedNote URL: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new RednoteResolveError(`Exceeded maximum allowed redirects (${maxRedirects}).`);
}
