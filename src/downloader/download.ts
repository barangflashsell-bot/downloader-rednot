import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { validateMediaUrl } from '../rednote/media-validator';
import { getStorageAdapter, generateStorageKey } from '../storage/storage';
import { DownloadOptions, DownloadResult } from './types';
import {
  RednoteFileTooLargeError,
  RednoteInvalidContentTypeError,
  RednoteDownloadRedirectError,
  RednoteDownloadNetworkError,
  RednoteStorageError,
} from './errors';

const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_FILE_SIZE_MB = 50;
const DEFAULT_TELEGRAM_MAX_FILE_SIZE_MB = 20;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Downloads a validated RedNote media file via streaming HTTP, enforces size and content-type limits,
 * and securely uploads it to persistent object storage.
 */
export async function downloadAndStoreMedia(
  url: string,
  meta?: {
    postId?: string;
    expectedType?: 'video' | 'image';
    expectedMimeType?: string;
  },
  options?: DownloadOptions
): Promise<DownloadResult> {
  const maxBytes =
    options?.maxSizeBytes ??
    Number(process.env.MAX_FILE_SIZE_MB || DEFAULT_MAX_FILE_SIZE_MB) * 1024 * 1024;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxRetries = options?.retries ?? DEFAULT_MAX_RETRIES;
  const storageAdapter = options?.storageAdapter ?? getStorageAdapter();
  const fetchImpl = options?.fetchFn ?? fetch;
  const tempDir = options?.tempDir ?? os.tmpdir();
  const telegramMaxBytes =
    options?.telegramMaxSizeBytes ??
    Number(process.env.TELEGRAM_MAX_FILE_SIZE_MB || DEFAULT_TELEGRAM_MAX_FILE_SIZE_MB) * 1024 * 1024;

  let currentUrl = (url || '').trim();

  // 1. Validate source URL against SSRF and media allowlist
  if (!validateMediaUrl(currentUrl)) {
    throw new RednoteDownloadRedirectError(`Unauthorized or insecure media URL: ${currentUrl}`);
  }

  // Pre-check deduplication if expected MIME type is known
  if (meta?.expectedMimeType) {
    const preCheckKey = generateStorageKey({
      postId: meta.postId,
      mediaUrl: currentUrl,
      mimeType: meta.expectedMimeType,
    });
    const alreadyStored = await storageAdapter.exists(preCheckKey).catch(() => false);
    if (alreadyStored) {
      console.log(`[DOWNLOADER] Reusing existing stored object: ${preCheckKey}`);
      const publicUrl = await storageAdapter.getUrl(preCheckKey);
      const mediaType: 'video' | 'image' =
        meta.expectedType ||
        (meta.expectedMimeType.startsWith('video/') ? 'video' : 'image');
      return {
        success: true,
        storageKey: preCheckKey,
        publicUrl,
        mimeType: meta.expectedMimeType,
        mediaType,
        size: 0,
        postId: meta.postId,
        deliveryMode: 'telegram',
      };
    }
  }

  // Helper to execute download with limited retry on transient failures
  let attempt = 0;
  while (attempt <= maxRetries) {
    let tempFilePath: string | null = null;
    let redirectCount = 0;
    currentUrl = (url || '').trim();

    try {
      // 2. Follow redirects manually and validate every hop
      let response: Response;
      while (true) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          console.log(`[DOWNLOADER] Fetching media: ${currentUrl}`);
          response = await fetchImpl(currentUrl, {
            method: 'GET',
            redirect: 'manual',
            signal: controller.signal,
            headers: {
              'User-Agent': USER_AGENT,
              Accept: 'video/*,image/*,*/*;q=0.8',
            },
          });
        } catch (err: unknown) {
          clearTimeout(timer);
          if (err instanceof Error && err.name === 'AbortError') {
            throw new RednoteDownloadNetworkError(`Media download timed out after ${timeoutMs}ms.`);
          }
          throw new RednoteDownloadNetworkError(
            `Network request failed: ${err instanceof Error ? err.message : String(err)}`
          );
        } finally {
          clearTimeout(timer);
        }

        // Handle redirects (301, 302, 303, 307, 308)
        if (
          response.status === 301 ||
          response.status === 302 ||
          response.status === 303 ||
          response.status === 307 ||
          response.status === 308
        ) {
          redirectCount += 1;
          if (redirectCount > maxRedirects) {
            throw new RednoteDownloadRedirectError(
              `Exceeded maximum allowed redirects (${maxRedirects}).`
            );
          }

          const location = response.headers.get('location');
          if (!location) {
            throw new RednoteDownloadRedirectError('Redirect response missing Location header.');
          }

          const nextUrlObj = new URL(location, currentUrl);
          const nextUrl = nextUrlObj.toString();

          if (!validateMediaUrl(nextUrl)) {
            throw new RednoteDownloadRedirectError(
              `Redirect to unauthorized or insecure media host rejected: ${nextUrl}`
            );
          }

          currentUrl = nextUrl;
          continue;
        }

        break;
      }

      if (!response.ok) {
        throw new RednoteDownloadNetworkError(
          `Media server responded with status HTTP ${response.status} ${response.statusText}`
        );
      }

      // 3. Validate Content-Type
      const rawContentType = response.headers.get('content-type') || '';
      let normalizedContentType = rawContentType.split(';')[0].trim().toLowerCase();

      // Reject HTML, JSON, plain text error pages pretending to be media
      if (
        normalizedContentType === 'text/html' ||
        normalizedContentType === 'application/json' ||
        normalizedContentType === 'text/plain'
      ) {
        throw new RednoteInvalidContentTypeError(
          `Server returned non-media content type: ${normalizedContentType}`
        );
      }

      if (!normalizedContentType && meta?.expectedMimeType) {
        normalizedContentType = meta.expectedMimeType.toLowerCase();
      }

      if (!ALLOWED_MIME_TYPES.has(normalizedContentType)) {
        throw new RednoteInvalidContentTypeError(
          `Unsupported media content type received: ${normalizedContentType || 'unknown'}`
        );
      }

      const mediaType: 'video' | 'image' = normalizedContentType.startsWith('video/')
        ? 'video'
        : 'image';

      // 4. Pre-check Content-Length header
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const declaredSize = parseInt(contentLengthHeader, 10);
        if (!isNaN(declaredSize) && declaredSize > maxBytes) {
          throw new RednoteFileTooLargeError(
            `Media declared size (${(declaredSize / 1024 / 1024).toFixed(2)} MB) exceeds limit (${(maxBytes / 1024 / 1024).toFixed(2)} MB).`
          );
        }
      }

      // 5. Check for existing object (deduplication)
      const storageKey = generateStorageKey({
        postId: meta?.postId,
        mediaUrl: currentUrl,
        mimeType: normalizedContentType,
      });

      const alreadyExists = await storageAdapter.exists(storageKey).catch(() => false);
      if (alreadyExists) {
        console.log(`[DOWNLOADER] Reusing existing stored object: ${storageKey}`);
        const publicUrl = await storageAdapter.getUrl(storageKey);
        const existingSize = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
        return {
          success: true,
          storageKey,
          publicUrl,
          mimeType: normalizedContentType,
          mediaType,
          size: existingSize,
          postId: meta?.postId,
          deliveryMode:
            existingSize > 0 && existingSize <= telegramMaxBytes ? 'telegram' : 'link',
        };
      }

      // 6. Stream chunks into temporary file with byte counter protection
      const tempId = crypto.randomBytes(16).toString('hex');
      tempFilePath = path.join(tempDir, `rednote_stream_${tempId}.tmp`);
      const fileWriteStream = fs.createWriteStream(tempFilePath);
      fileWriteStream.on('error', () => {});
      await new Promise<void>((resolve, reject) => {
        fileWriteStream.once('open', () => resolve());
        fileWriteStream.once('error', reject);
      });

      let totalBytesDownloaded = 0;

      if (!response.body) {
        fileWriteStream.destroy();
        throw new RednoteDownloadNetworkError('Response body is empty or unavailable.');
      }

      // Read Web ReadableStream chunk by chunk
      const reader = response.body.getReader();
      let writeFinished = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value) {
            totalBytesDownloaded += value.length;
            if (totalBytesDownloaded > maxBytes) {
              await reader.cancel().catch(() => {});
              fileWriteStream.destroy();
              throw new RednoteFileTooLargeError(
                `Media stream exceeded maximum allowable limit (${(maxBytes / 1024 / 1024).toFixed(2)} MB).`
              );
            }

            const canContinue = fileWriteStream.write(Buffer.from(value));
            if (!canContinue) {
              await new Promise<void>((resolve) => fileWriteStream.once('drain', resolve));
            }
          }
        }
        writeFinished = true;
      } catch (streamErr) {
        fileWriteStream.destroy();
        throw streamErr;
      } finally {
        if (!fileWriteStream.destroyed) {
          fileWriteStream.end();
          if (writeFinished) {
            await new Promise<void>((resolve) => fileWriteStream.once('finish', resolve));
          }
        }
      }

      console.log(
        `[DOWNLOADER] Downloaded ${totalBytesDownloaded} bytes to temporary file: ${tempFilePath}`
      );

      // 7. Upload validated file stream to persistent storage
      let uploadResult;
      const fileReadStream = fs.createReadStream(tempFilePath);
      await new Promise<void>((resolve, reject) => {
        fileReadStream.once('open', () => resolve());
        fileReadStream.once('error', reject);
      });

      try {
        uploadResult = await storageAdapter.upload(storageKey, fileReadStream, {
          contentType: normalizedContentType,
          addRandomSuffix: false,
        });
      } catch (err: unknown) {
        fileReadStream.destroy();
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('BLOB_READ_WRITE_TOKEN')) {
          console.warn(
            '[DOWNLOADER] BLOB_READ_WRITE_TOKEN is not configured. Falling back to direct CDN URL for delivery.'
          );
          uploadResult = {
            storageKey,
            publicUrl: currentUrl,
            contentType: normalizedContentType,
          };
        } else {
          throw new RednoteStorageError(
            `Storage upload failed: ${errMsg}`
          );
        }
      } finally {
        fileReadStream.destroy();
      }

      return {
        success: true,
        storageKey: uploadResult.storageKey,
        publicUrl: uploadResult.publicUrl,
        mimeType: normalizedContentType,
        mediaType,
        size: totalBytesDownloaded,
        postId: meta?.postId,
        deliveryMode: totalBytesDownloaded <= telegramMaxBytes ? 'telegram' : 'link',
      };
    } catch (err: unknown) {
      // Non-retryable errors
      if (
        err instanceof RednoteFileTooLargeError ||
        err instanceof RednoteInvalidContentTypeError ||
        err instanceof RednoteDownloadRedirectError ||
        err instanceof RednoteStorageError
      ) {
        throw err;
      }

      attempt += 1;
      if (attempt > maxRetries) {
        if (
          err instanceof RednoteStorageError ||
          err instanceof RednoteDownloadNetworkError ||
          err instanceof RednoteDownloadRedirectError ||
          err instanceof RednoteInvalidContentTypeError ||
          err instanceof RednoteFileTooLargeError
        ) {
          throw err;
        }
        throw new RednoteDownloadNetworkError(
          `Download failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      console.log(
        `[DOWNLOADER] Transient download error (attempt ${attempt}/${maxRetries}): ${
          err instanceof Error ? err.message : String(err)
        }. Retrying...`
      );
      await new Promise((res) => setTimeout(res, Math.pow(2, attempt) * 200));
    } finally {
      // 8. Clean up temporary files reliably
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          await fs.promises.unlink(tempFilePath);
        } catch {
          // Ignore cleanup unlink error
        }
      }
    }
  }

  throw new RednoteDownloadNetworkError('Maximum download retry attempts exceeded.');
}
