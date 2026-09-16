import crypto from 'crypto';
import { StorageAdapter } from './types';
import { VercelBlobStorageAdapter } from './vercel-blob';

const MIME_TO_EXTENSION: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Sanitizes a post ID to ensure it contains only safe alphanumeric, underscore, or hyphen characters.
 */
export function sanitizePostId(rawPostId?: string): string {
  if (!rawPostId || typeof rawPostId !== 'string') {
    return 'unknown';
  }

  // Remove control characters and traversal dots, and convert path separators to underscores
  const cleaned = rawPostId
    .replace(/[\0\x00-\x1F\x7F]/g, '')
    .replace(/\.\./g, '')
    .replace(/[/\\]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);

  return cleaned || 'unknown';
}

/**
 * Generates a deterministic, collision-safe storage object key.
 * Format: rednote/<sanitized-post-id>/<sha256-hash>.<safe-extension>
 */
export function generateStorageKey(params: {
  postId?: string;
  mediaUrl: string;
  mimeType: string;
}): string {
  const safePostId = sanitizePostId(params.postId);

  // Normalize mime type to secure extension
  const normalizedMime = (params.mimeType || '').toLowerCase().trim();
  const safeExtension = MIME_TO_EXTENSION[normalizedMime] || 'bin';

  // Create SHA-256 hash of the media URL for collision-free deterministic keying
  const hash = crypto
    .createHash('sha256')
    .update(params.mediaUrl.trim())
    .digest('hex')
    .slice(0, 32);

  const key = `rednote/${safePostId}/${hash}.${safeExtension}`;

  // Final sanity check against path traversal or malicious character injection
  if (key.includes('..') || key.includes('\\') || key.includes('\0') || key.startsWith('/')) {
    throw new Error('Invalid storage key generated: path traversal detected.');
  }

  return key;
}

let activeStorageAdapter: StorageAdapter | null = null;

/**
 * Gets or initializes the configured StorageAdapter.
 */
export function getStorageAdapter(): StorageAdapter {
  if (activeStorageAdapter) {
    return activeStorageAdapter;
  }

  activeStorageAdapter = new VercelBlobStorageAdapter();
  return activeStorageAdapter;
}

/**
 * Overrides the active storage adapter (useful for dependency injection or testing).
 */
export function setStorageAdapter(adapter: StorageAdapter | null): void {
  activeStorageAdapter = adapter;
}
