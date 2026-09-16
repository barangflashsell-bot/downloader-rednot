const ALLOWED_DOMAINS = new Set([
  'xiaohongshu.com',
  'www.xiaohongshu.com',
  'xhslink.com',
  'www.xhslink.com',
]);

/**
 * Validates whether a given string is a valid RedNote / Xiaohongshu URL.
 * Only HTTPS protocol and permitted domains are accepted.
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
 *
 * @param text - Input message text
 * @returns Extracted URL string or null if none found
 */
export function extractRednoteUrl(text: string): string | null {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();
  if (isRednoteUrl(trimmed)) {
    return trimmed;
  }

  // Regex to match URLs starting with https://
  const urlRegex = /https:\/\/[^\s<>"'()]+/gi;
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
  }

  return null;
}
