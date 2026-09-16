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

    // Check if the item is flagged for direct Telegram upload
    if (item.deliveryMode === 'telegram') {
      try {
        if (item.mediaType === 'video') {
          try {
            await ctx.replyWithVideo(item.publicUrl, {
              caption: post.title ? `📹 ${post.title}${itemLabel}` : undefined,
            });
          } catch (urlErr) {
            console.warn(
              `[DELIVERY] Direct URL upload failed (${urlErr instanceof Error ? urlErr.message : String(urlErr)}). Retrying with InputFile streaming...`
            );
            await ctx.replyWithVideo(new InputFile(new URL(item.publicUrl)), {
              caption: post.title ? `📹 ${post.title}${itemLabel}` : undefined,
            });
          }
        } else {
          try {
            await ctx.replyWithPhoto(item.publicUrl, {
              caption: post.title ? `📸 ${post.title}${itemLabel}` : undefined,
            });
          } catch (urlErr) {
            console.warn(
              `[DELIVERY] Direct URL photo upload failed (${urlErr instanceof Error ? urlErr.message : String(urlErr)}). Retrying with InputFile streaming...`
            );
            await ctx.replyWithPhoto(new InputFile(new URL(item.publicUrl)), {
              caption: post.title ? `📸 ${post.title}${itemLabel}` : undefined,
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
