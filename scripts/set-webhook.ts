import 'dotenv/config';
import { Bot } from 'grammy';

async function main() {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken || botToken.trim() === '') {
    console.error('❌ Error: BOT_TOKEN is not configured in environment variables.');
    process.exit(1);
  }

  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.trim() === '') {
    console.error('❌ Error: WEBHOOK_URL is not configured in environment variables.');
    console.error('Contoh: WEBHOOK_URL=https://your-project.vercel.app/api/telegram');
    process.exit(1);
  }

  if (!webhookUrl.startsWith('https://')) {
    console.error('❌ Error: WEBHOOK_URL harus menggunakan protokol HTTPS (Telegram requirement).');
    process.exit(1);
  }

  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.trim() === '') {
    console.error('❌ Error: WEBHOOK_SECRET is not configured in environment variables.');
    console.error('Secret token diperlukan untuk mengamankan webhook endpoint.');
    process.exit(1);
  }

  console.log(`Setting webhook to: ${webhookUrl}`);
  console.log('Sending setWebhook request to Telegram Bot API...');

  try {
    const bot = new Bot(botToken.trim());
    const result = await bot.api.setWebhook(webhookUrl.trim(), {
      secret_token: webhookSecret.trim(),
      drop_pending_updates: false,
    });

    if (result) {
      console.log('✅ Webhook berhasil didaftarkan ke Telegram!');
      console.log(`URL: ${webhookUrl}`);
    } else {
      console.error('❌ Gagal mengatur webhook (Telegram API mengembalikan false).');
      process.exit(1);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Terjadi kesalahan saat memanggil setWebhook:', message);
    process.exit(1);
  }
}

main();
