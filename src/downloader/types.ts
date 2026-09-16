import { StorageAdapter } from '../storage/types';

export interface DownloadOptions {
  maxSizeBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  retries?: number;
  storageAdapter?: StorageAdapter;
  fetchFn?: typeof fetch;
  tempDir?: string;
  telegramMaxSizeBytes?: number;
}

export interface DownloadResult {
  success: true;
  storageKey: string;
  publicUrl: string;
  mimeType: string;
  mediaType: 'video' | 'image';
  size: number;
  postId?: string;
  deliveryMode: 'telegram' | 'link';
}
