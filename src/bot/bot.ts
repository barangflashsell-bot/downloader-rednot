import { Bot } from 'grammy';
import { extractRednoteUrl } from '../utils/url';
import { processRednoteMedia } from '../media/media-service';
import { deliverProcessedMedia } from './delivery';
import { mapErrorToUserMessage } from './error-mapper';

export const START_MESSAGE = `👋 Halo!

Selamat datang di RedNote Downloader Bot.

Kirim link Xiaohongshu / RedNote dan bot akan mengunduh media dari postingan publik tersebut.

📥 Cara menggunakan:
1. Salin link postingan RedNote / Xiaohongshu
2. Kirim link ke chat ini
3. Tunggu proses selesai

Contoh format link:
• https://www.xiaohongshu.com/explore/...
• https://xhslink.com/...`;

export const HELP_MESSAGE = `ℹ️ Bantuan & Informasi Penggunaan

1. Kirim link postingan Xiaohongshu / RedNote ke chat ini:
   • xiaohongshu.com
   • xhslink.com
2. Bot hanya memproses konten publik yang dapat diakses secara terbuka.
3. Konten privat atau memerlukan autentikasi login tidak didukung.
4. Bot mematuhi aturan platform dan TIDAK membypass CAPTCHA atau WAF/security challenge.
5. Media berukuran besar yang melebihi batas Telegram akan diberikan dalam bentuk tombol tautan unduhan langsung dari cloud storage.`;

export const ABOUT_MESSAGE = `ℹ️ RedNote Downloader Bot

Telegram bot untuk mengunduh media dari postingan publik Xiaohongshu / RedNote.

• Versi: v1.0.0
• Engine: Node.js + TypeScript + grammY
• Arsitektur: Vercel Serverless + Persistent Storage
• Keamanan: Anti-SSRF, strict content-type validation & safe storage keys`;

export const STATUS_MESSAGE = `📊 Status Layanan

• Status Bot: Aktif (Online)
• Engine: Vercel Serverless
• Penyimpanan: Persistent Object Storage (Vercel Blob)
• Proteksi: Anti-SSRF & Enforced Size Limits
• Catatan: Konten publik Xiaohongshu dilayani sesuai kebijakan ketersediaan akses tanpa bypass WAF.`;

export const INVALID_URL_MESSAGE = `❌ Link tidak dikenali.

Bot ini khusus menerima link postingan Xiaohongshu / RedNote yang valid (xiaohongshu.com atau xhslink.com).`;

export const PROCESSING_MESSAGE = `⏳ Memproses link...`;

export const SUCCESS_MESSAGE = `✅ Berhasil diproses.`;

export const ERROR_FALLBACK_MESSAGE = `❌ Terjadi kesalahan saat memproses pesan. Silakan coba lagi.`;

export interface BotFactoryOptions {
  processMediaFn?: typeof processRednoteMedia;
  deliverMediaFn?: typeof deliverProcessedMedia;
}

/**
 * Creates and configures a grammY Bot instance.
 *
 * @param token - Optional bot token, defaults to process.env.BOT_TOKEN
 * @param options - Optional injected processing/delivery handlers for testing
 * @returns Configured Bot instance
 */
export function createBot(token?: string, options?: BotFactoryOptions): Bot {
  const botToken = token ?? process.env.BOT_TOKEN;

  if (!botToken || botToken.trim() === '') {
    throw new Error('BOT_TOKEN is not configured in environment variables');
  }

  const bot = new Bot(botToken.trim());
  const processFn = options?.processMediaFn ?? processRednoteMedia;
  const deliverFn = options?.deliverMediaFn ?? deliverProcessedMedia;

  // Global error handling: log server-side safely without leaking secrets or crashing
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(
      `[Telegram Bot Error] Update ID: ${ctx.update.update_id}`,
      err.error instanceof Error ? err.error.message : String(err.error)
    );

    ctx.reply(ERROR_FALLBACK_MESSAGE).catch((replyErr) => {
      console.error('[Telegram Bot Error] Failed to send error reply:', replyErr);
    });
  });

  // /start command
  bot.command('start', async (ctx) => {
    await ctx.reply(START_MESSAGE);
  });

  // /help command
  bot.command('help', async (ctx) => {
    await ctx.reply(HELP_MESSAGE);
  });

  // /about command
  bot.command('about', async (ctx) => {
    await ctx.reply(ABOUT_MESSAGE);
  });

  // /status command
  bot.command('status', async (ctx) => {
    await ctx.reply(STATUS_MESSAGE);
  });

  // Non-command text message handler
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();

    // 1. Extract valid RedNote URL
    const targetUrl = extractRednoteUrl(text);

    if (!targetUrl) {
      await ctx.reply(INVALID_URL_MESSAGE);
      return;
    }

    // 2. Send processing status message
    let statusMessageId: number | null = null;
    try {
      const statusMsg = await ctx.reply(PROCESSING_MESSAGE);
      statusMessageId = statusMsg.message_id;
    } catch (statusErr) {
      console.warn('[Telegram Bot] Could not send initial status message:', statusErr);
    }

    // 3. Execute extraction, download, storage, and delivery
    try {
      const processedResult = await processFn(targetUrl);

      // Deliver media to Telegram user
      await deliverFn(ctx, processedResult);

      // Update status message on success
      if (statusMessageId !== null && ctx.chat) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            statusMessageId,
            SUCCESS_MESSAGE
          );
        } catch {
          // Status edit is cosmetic, safe to ignore failure
        }
      }
    } catch (err: unknown) {
      console.error(
        `[Telegram Bot] Error processing URL "${targetUrl}":`,
        err instanceof Error ? err.message : String(err)
      );

      const userMessage = mapErrorToUserMessage(err);

      if (statusMessageId !== null && ctx.chat) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            statusMessageId,
            userMessage
          );
          return;
        } catch {
          // Fall through to ctx.reply
        }
      }

      await ctx.reply(userMessage);
    }
  });

  return bot;
}

let botInstance: Bot | null = null;

/**
 * Returns the singleton Bot instance.
 */
export function getBot(): Bot {
  if (!botInstance) {
    botInstance = createBot();
  }
  return botInstance;
}

/**
 * Exported bot instance accessor.
 */
export const bot = new Proxy({} as Bot, {
  get(_target, prop) {
    const instance = getBot();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});
