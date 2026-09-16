import { put, head, del, BlobNotFoundError } from '@vercel/blob';
import { Readable } from 'stream';
import { StorageAdapter, StorageUploadOptions, StorageUploadResult } from './types';

export class VercelBlobStorageAdapter implements StorageAdapter {
  private readonly token?: string;

  constructor(token?: string) {
    this.token = token || process.env.BLOB_READ_WRITE_TOKEN;
  }

  private getToken(): string {
    const token = this.token || process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error(
        'Vercel Blob storage token (BLOB_READ_WRITE_TOKEN) is not configured.'
      );
    }
    return token;
  }

  async upload(
    key: string,
    body: Readable | NodeJS.ReadableStream | ReadableStream | Buffer,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    const token = this.getToken();

    const blob = await put(key, body as Parameters<typeof put>[1], {
      access: 'public',
      token,
      contentType: options?.contentType,
      addRandomSuffix: options?.addRandomSuffix ?? false,
    });

    console.log(`[STORAGE] Uploaded object to Vercel Blob: ${blob.pathname}`);

    return {
      storageKey: blob.pathname,
      publicUrl: blob.url,
      contentType: blob.contentType,
    };
  }

  async getUrl(key: string): Promise<string> {
    const token = this.getToken();
    try {
      const details = await head(key, { token });
      return details.url;
    } catch (err: unknown) {
      if (err instanceof BlobNotFoundError) {
        throw new Error(`Storage object not found: ${key}`);
      }
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const token = this.getToken();
    try {
      await head(key, { token });
      return true;
    } catch (err: unknown) {
      if (err instanceof BlobNotFoundError || (err instanceof Error && err.message.includes('404'))) {
        return false;
      }
      // If unauthorized or other network error, rethrow
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const token = this.getToken();
    console.log(`[STORAGE] Manual deletion requested for: ${key}`);
    await del(key, { token });
  }
}
