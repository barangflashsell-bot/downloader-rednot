import { Readable } from 'stream';

export interface StorageMetadata {
  postId?: string;
  mediaType: 'video' | 'image';
  mimeType: string;
  size: number;
  storageKey: string;
  publicUrl: string;
  createdAt: string;
}

export interface StorageUploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  addRandomSuffix?: boolean;
}

export interface StorageUploadResult {
  storageKey: string;
  publicUrl: string;
  size?: number;
  contentType?: string;
}

/**
 * Vendor-neutral storage adapter interface for persistent object storage.
 * Note: The delete method is provided for manual/administrative operations only.
 * No automatic deletion or TTL is permitted.
 */
export interface StorageAdapter {
  /**
   * Upload an object stream or buffer to persistent storage.
   */
  upload(
    key: string,
    body: Readable | NodeJS.ReadableStream | ReadableStream | Buffer,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult>;

  /**
   * Get the public URL for an existing storage object key.
   */
  getUrl(key: string): Promise<string>;

  /**
   * Check whether an object exists in storage under the given key.
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete an object manually (admin capability only).
   */
  delete(key: string): Promise<void>;
}
