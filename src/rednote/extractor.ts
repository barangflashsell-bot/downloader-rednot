import { isRednoteUrl } from '../utils/url';
import { RednotePost } from './types';
import {
  RednoteInvalidUrlError,
  RednoteAccessError,
  RednoteNetworkError,
} from './errors';
import { resolveRednoteUrlDetailed, MOBILE_USER_AGENT } from './resolver';
import { parseRednoteHtml } from './parser';

export interface ExtractorOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  maxHtmlSizeBytes?: number;
}

const DEFAULT_USER_AGENT = MOBILE_USER_AGENT;

const MAX_HTML_SIZE = 5 * 1024 * 1024; // 5 MB limit for HTML response

/**
 * Extracts public media and metadata from a RedNote (Xiaohongshu) post URL.
 * Only accesses publicly accessible content without bypassing access controls.
 *
 * @param url - User-provided RedNote URL (supports explore, discovery, or xhslink short links)
 * @param options - Custom network and timeout configurations
 * @returns Parsed RednotePost structure with verified media URLs
 */
export async function extractRednote(
  url: string,
  options?: ExtractorOptions
): Promise<RednotePost> {
  let trimmedUrl = url ? url.trim() : '';

  // Transparently upgrade http to https for authorized domains
  if (/^http:\/\//i.test(trimmedUrl)) {
    const upgraded = trimmedUrl.replace(/^http:\/\//i, 'https://');
    if (isRednoteUrl(upgraded)) {
      trimmedUrl = upgraded;
    }
  }

  // 1. Validate URL
  if (!isRednoteUrl(trimmedUrl)) {
    throw new RednoteInvalidUrlError(`Invalid or unsupported RedNote URL: ${trimmedUrl}`);
  }

  const timeoutMs = options?.timeoutMs ?? Number(process.env.REQUEST_TIMEOUT_MS || 15000);
  const fetchImpl = options?.fetchFn ?? fetch;
  const maxSizeBytes = options?.maxHtmlSizeBytes ?? MAX_HTML_SIZE;

  // 2. Resolve short URL if needed (and collect redirect cookies)
  console.log(`[REDNOTE] Resolving URL: ${trimmedUrl}`);
  const resolved = await resolveRednoteUrlDetailed(trimmedUrl, {
    timeoutMs,
    fetchFn: fetchImpl,
  });
  const resolvedUrl = resolved.url;

  // 3. Fetch public page HTML
  console.log(`[REDNOTE] Fetching public page: ${resolvedUrl}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let html: string;

  try {
    const headers: Record<string, string> = {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9,en;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    };

    if (resolved.cookies.length > 0) {
      headers['Cookie'] = resolved.cookies.map((c) => c.split(';')[0]).join('; ');
    }

    const response = await fetchImpl(resolvedUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new RednoteAccessError(
        `Access denied (HTTP ${response.status}). The post may be private or restricted.`
      );
    }

    if (response.status === 404) {
      throw new RednoteAccessError('RedNote post not found (HTTP 404). It may have been deleted.');
    }

    if (!response.ok) {
      throw new RednoteNetworkError(
        `Failed to fetch RedNote page: HTTP ${response.status} ${response.statusText}`
      );
    }

    // Read text safely with size limit checking
    html = await response.text();

    if (html.length > maxSizeBytes) {
      throw new RednoteNetworkError('Received HTML page exceeds maximum permissible size limit.');
    }

    // Check if the response is a CAPTCHA, WAF, or verification intercept page
    if (
      resolvedUrl.includes('/404/sec_') ||
      resolvedUrl.includes('source=xhs_sec_server') ||
      resolvedUrl.includes('error_code=300031') ||
      html.includes('verify_slider') ||
      html.includes('captcha-container') ||
      html.includes('waf-verify') ||
      html.includes('你访问的页面不见了')
    ) {
      throw new RednoteAccessError(
        'RedNote anti-bot verification or security intercept encountered (xhs_sec_server). Public access restricted.'
      );
    }
  } catch (err: unknown) {
    if (err instanceof RednoteAccessError || err instanceof RednoteNetworkError) {
      throw err;
    }

    if (err instanceof Error && err.name === 'AbortError') {
      throw new RednoteNetworkError(`Request timed out after ${timeoutMs}ms while fetching page.`);
    }

    throw new RednoteNetworkError(
      `Network error while fetching RedNote page: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }

  // 4. Parse public metadata
  console.log('[REDNOTE] Parsing metadata');
  const post = parseRednoteHtml(html, resolvedUrl);

  console.log(`[REDNOTE] Media found: ${post.media.length}`);
  return post;
}
