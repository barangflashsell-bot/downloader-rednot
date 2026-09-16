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
  onCookie?: (cookie: string) => void;
}

export interface ResolvedResult {
  url: string;
  cookies: string[];
}

export const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/**
 * Validates whether a URL's protocol is HTTP/HTTPS and domain is an authorized RedNote domain.
 * Upgrades HTTP to HTTPS.
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
 * Resolves short RedNote URLs to the final canonical URL with cookie tracking.
 */
export async function resolveRednoteUrlDetailed(
  url: string,
  options?: ResolverOptions
): Promise<ResolvedResult> {
  const maxRedirects = options?.maxRedirects ?? Number(process.env.MAX_REDIRECTS || 5);
  const timeoutMs = options?.timeoutMs ?? Number(process.env.REQUEST_TIMEOUT_MS || 15000);
  const fetchImpl = options?.fetchFn ?? fetch;

  let currentUrl = validateResolverUrl(url.trim()).toString();
  const collectedCookies: string[] = [];
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[REDNOTE] Resolving URL: ${currentUrl}`);

      const response = await fetchImpl(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': MOBILE_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      // Capture set-cookie headers
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        collectedCookies.push(setCookie);
        options?.onCookie?.(setCookie);
      }

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

      // If status is 200 or any non-redirect, we reached destination
      return {
        url: currentUrl,
        cookies: collectedCookies,
      };
    } catch (err: unknown) {
      if (
        err instanceof RednoteResolveError ||
        err instanceof RednoteUnsupportedUrlError ||
        err instanceof RednoteInvalidUrlError
      ) {
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
  const result = await resolveRednoteUrlDetailed(url, options);
  return result.url;
}
