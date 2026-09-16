import { Readable } from 'stream';
import { StorageAdapter, StorageUploadOptions, StorageUploadResult } from '../../src/storage/types';

interface StoredItem {
  buffer: Buffer;
  publicUrl: string;
  contentType?: string;
  metadata?: Record<string, string>;
  createdAt: string;
}

/**
 * In-memory storage adapter strictly intended for unit and integration testing.
 * Provides deterministic and zero-dependency object storage simulation without requiring credentials.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly items = new Map<string, StoredItem>();

  async upload(
    key: string,
    body: Readable | NodeJS.ReadableStream | ReadableStream | Buffer,
    options?: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    let buffer: Buffer;

    if (Buffer.isBuffer(body)) {
      buffer = body;
    } else if ('getReader' in body) {
      // Web ReadableStream
      const reader = (body as ReadableStream).getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      buffer = Buffer.concat(chunks);
    } else {
      // Node.js Readable stream
      const stream = body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      buffer = Buffer.concat(chunks);
    }

    const publicUrl = `https://blob.vercel-storage.com/mock-store/${key}`;
    this.items.set(key, {
      buffer,
      publicUrl,
      contentType: options?.contentType,
      metadata: options?.metadata,
      createdAt: new Date().toISOString(),
    });

    return {
      storageKey: key,
      publicUrl,
      size: buffer.length,
      contentType: options?.contentType,
    };
  }

  async getUrl(key: string): Promise<string> {
    const item = this.items.get(key);
    if (!item) {
      throw new Error(`Storage object not found: ${key}`);
    }
    return item.publicUrl;
  }

  async exists(key: string): Promise<boolean> {
    return this.items.has(key);
  }

  async delete(key: string): Promise<void> {
    this.items.delete(key);
  }

  // Testing helpers
  getItem(key: string): StoredItem | undefined {
    return this.items.get(key);
  }

  count(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }
}
