import { extractRednote, ExtractorOptions } from '../rednote/extractor';
import { RednotePost, RednoteMedia } from '../rednote/types';
import { downloadAndStoreMedia } from '../downloader/download';
import { DownloadOptions, DownloadResult } from '../downloader/types';

export interface ProcessMediaOptions extends DownloadOptions {
  extractorOptions?: ExtractorOptions;
  concurrency?: number;
}

export interface ProcessedMediaResult {
  post: RednotePost;
  storedMedia: DownloadResult[];
}

const DEFAULT_CONCURRENCY = 2;

/**
 * Concurrency limiter to process items in batches of controlled size.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const safeConcurrency = Math.max(1, concurrency);
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(safeConcurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Service layer coordinating extraction and downloading into persistent storage.
 * Note: Never fakes success. If the extractor is blocked by platform WAF or fails,
 * the error is reported honestly.
 *
 * @param url - User-provided RedNote / Xiaohongshu URL
 * @param options - Options for extractor, downloader, and concurrency
 * @returns Processed post metadata and persistent storage download results
 */
export async function processRednoteMedia(
  url: string,
  options?: ProcessMediaOptions
): Promise<ProcessedMediaResult> {
  console.log(`[REDNOTE SERVICE] Processing URL: ${url}`);

  // 1. Extract metadata and media URLs from public post
  const post = await extractRednote(url, options?.extractorOptions);

  // 2. Download and store each verified media item with controlled concurrency
  const concurrency =
    options?.concurrency ??
    Number(process.env.MAX_CONCURRENT_DOWNLOADS || DEFAULT_CONCURRENCY);

  const storedMedia = await runWithConcurrency(
    post.media,
    concurrency,
    async (mediaItem: RednoteMedia) => {
      return downloadAndStoreMedia(
        mediaItem.url,
        {
          postId: post.id,
          expectedType: mediaItem.type,
          expectedMimeType: mediaItem.mimeType,
        },
        options
      );
    }
  );

  console.log(
    `[REDNOTE SERVICE] Completed processing. Stored ${storedMedia.length} media items.`
  );

  return {
    post,
    storedMedia,
  };
}
