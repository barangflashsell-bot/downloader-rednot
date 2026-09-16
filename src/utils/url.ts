const ALLOWED_DOMAINS = new Set([
  'xiaohongshu.com',
  'www.xiaohongshu.com',
  'xhslink.com',
  'www.xhslink.com',
  'rednote.com',
  'www.rednote.com',
]);

/**
 * Validates whether a given string is a valid RedNote / Xiaohongshu URL.
 * Only HTTPS protocol and permitted domains are accepted directly.
 *
 * @param input - The URL string to test
 * @returns boolean indicating if the URL is an allowed RedNote URL
 */
export function isRednoteUrl(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(input.trim());
    if (parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_DOMAINS.has(hostname);
  } catch {
    return false;
  }
}

/**
 * Extracts the first valid RedNote / Xiaohongshu URL from a given text.
 * Handles messages that include shared commentary alongside the URL.
 * Transparently upgrades shared http:// links on authorized RedNote domains to https://.
 *
 * @param text - Input message text
 * @returns Extracted canonical HTTPS URL string or null if none found
 */
export function extractRednoteUrl(text: string): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();
  if (isRednoteUrl(trimmed)) {
    return trimmed;
  }

  // If user passed a single http:// link for an authorized domain, upgrade to https://
  if (/^http:\/\//i.test(trimmed)) {
    const upgraded = trimmed.replace(/^http:\/\//i, 'https://');
    if (isRednoteUrl(upgraded)) {
      return upgraded;
    }
  }

  // Regex to match URLs starting with http:// or https://
  const urlRegex = /https?:\/\/[^\s<>"'()]+/gi;
  const matches = text.match(urlRegex);
  if (!matches) {
    return null;
  }

  for (const candidate of matches) {
    // Strip trailing punctuation often appended in chat text (e.g. '.', ',', '!')
    const cleaned = candidate.replace(/[.,!?;]+$/, '');
    if (isRednoteUrl(cleaned)) {
      return cleaned;
    }

    // Upgrade http to https if domain is an authorized RedNote domain
    if (/^http:\/\//i.test(cleaned)) {
      const upgraded = cleaned.replace(/^http:\/\//i, 'https://');
      if (isRednoteUrl(upgraded)) {
        return upgraded;
      }
    }
  }

  return null;
}
