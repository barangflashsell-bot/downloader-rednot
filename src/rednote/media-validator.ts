/**
 * Base domains strictly authorized for RedNote media (videos and images).
 */
const ALLOWED_MEDIA_DOMAINS = [
  'xhscdn.com',
  'xiaohongshu.com',
  'rednote.com',
];

/**
 * Checks whether an IP or hostname is private or local (SSRF prevention).
 */
function isPrivateOrLocalHost(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    return true;
  }

  // IPv4 private/local ranges: 10.x.x.x, 127.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x, 100.64-127.x.x
  if (
    /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.)/.test(
      hostname
    )
  ) {
    return true;
  }

  // IPv6 unique local (fc00::/7) or link-local (fe80::/10)
  if (/^f[cd][0-9a-f]{2}:/i.test(hostname) || /^fe[89ab][0-9a-f]:/i.test(hostname)) {
    return true;
  }

  return false;
}

/**
 * Validates whether a media URL is safe, uses HTTPS, and belongs to an authorized RedNote CDN/domain.
 *
 * @param url - The URL to validate
 * @returns boolean indicating if the URL is a legitimate RedNote media source
 */
export function validateMediaUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmed = url.trim();

  // Reject dangerous pseudo-protocols explicitly
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('file:')
  ) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);

    // Only HTTPS protocol is allowed
    if (parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Prevent SSRF / local network traversal
    if (isPrivateOrLocalHost(hostname)) {
      return false;
    }

    // Must match authorized base domain exactly or as a subdomain
    const isAllowed = ALLOWED_MEDIA_DOMAINS.some(
      (baseDomain) => hostname === baseDomain || hostname.endsWith(`.${baseDomain}`)
    );

    return isAllowed;
  } catch {
    return false;
  }
}
