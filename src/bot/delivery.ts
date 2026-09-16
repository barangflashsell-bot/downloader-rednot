import { Context, InlineKeyboard, InputFile } from 'grammy';
import { ProcessedMediaResult } from '../media/media-service';

export interface DeliverySummary {
  total: number;
  directCount: number;
  linkCount: number;
}

/**
 * Creates an inline keyboard button pointing directly to the stored public URL.
 */
export function createDownloadKeyboard(url: string, mediaType: 'video' | 'image'): InlineKeyboard {
  const label = mediaType === 'video' ? '⬇️ Download Video' : '⬇️ Download Media';
  return new InlineKeyboard().url(label, url);
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function fetchMediaBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': '*/*',
      'Referer': 'https://www.xiaohongshu.com/',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch media from CDN: HTTP ${res.status}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Delivers processed media to a Telegram user.
 * Tries direct media delivery for files under Telegram's limit.
 * If file is too large or Telegram API upload fails, safely falls back
 * to providing an inline button pointing to persistent object storage.
 *
 * @param ctx - grammY context
 * @param processed - Result containing extracted post and stored media items
 * @returns DeliverySummary
 */
export async function deliverProcessedMedia(
  ctx: Context,
  processed: ProcessedMediaResult
): Promise<DeliverySummary> {
  const { post, storedMedia } = processed;
  let directCount = 0;
  let linkCount = 0;

  for (let i = 0; i < storedMedia.length; i++) {
    const item = storedMedia[i];
    const isSingle = storedMedia.length === 1;
    const itemLabel = isSingle ? '' : ` (${i + 1}/${storedMedia.length})`;
    const downloadKeyboard = createDownloadKeyboard(item.publicUrl, item.mediaType);
    const videoCaption = post.title ? `📹 ${post.title}${itemLabel}` : undefined;
    const photoCaption = post.title ? `📸 ${post.title}${itemLabel}` : undefined;

    // Check if the item is flagged for direct Telegram upload
    if (item.deliveryMode === 'telegram') {
      try {
        if (item.mediaType === 'video') {
          try {
            await ctx.replyWithVideo(item.publicUrl, {
              caption: videoCaption,
              reply_markup: downloadKeyboard,
            });
          } catch (urlErr) {
            console.warn(
              `[DELIVERY] Direct URL upload failed (${urlErr instanceof Error ? urlErr.message : String(urlErr)}). Retrying with clean buffer streaming...`
            );
            const videoBuffer = await fetchMediaBuffer(item.publicUrl);
            await ctx.replyWithVideo(new InputFile(videoBuffer, 'video.mp4'), {
              caption: videoCaption,
              reply_markup: downloadKeyboard,
            });
          }
        } else {
          try {
            await ctx.replyWithPhoto(item.publicUrl, {
              caption: photoCaption,
              reply_markup: downloadKeyboard,
            });
          } catch (urlErr) {
            console.warn(
              `[DELIVERY] Direct URL photo upload failed (${urlErr instanceof Error ? urlErr.message : String(urlErr)}). Retrying with buffer streaming...`
            );
            const photoBuffer = await fetchMediaBuffer(item.publicUrl);
            await ctx.replyWithPhoto(new InputFile(photoBuffer, 'image.jpg'), {
              caption: photoCaption,
              reply_markup: downloadKeyboard,
            });
          }
        }
        directCount++;
        continue;
      } catch (telegramErr) {
        console.warn(
          `[DELIVERY] Direct Telegram upload failed for item ${i + 1}. Falling back to inline link button:`,
          telegramErr instanceof Error ? telegramErr.message : String(telegramErr)
        );
        // Fall back to link delivery below
      }
    }

    // Large file or fallback after direct delivery failed
    const keyboard = createDownloadKeyboard(item.publicUrl, item.mediaType);
    const sizeStr = item.size > 0 ? ` (${(item.size / 1024 / 1024).toFixed(1)} MB)` : '';
    const messageText = item.deliveryMode === 'link'
      ? `📦 Media${itemLabel}${sizeStr} berhasil disimpan. Karena ukuran file, silakan unduh melalui tombol di bawah:`
      : `📹 Media${itemLabel} berhasil diproses, tetapi tidak dapat dikirim langsung ke Telegram. Silakan unduh melalui tautan di bawah:`;

    await ctx.reply(messageText, {
      reply_markup: keyboard,
    });
    linkCount++;
  }

  return {
    total: storedMedia.length,
    directCount,
    linkCount,
  };
}
