import 'dotenv/config';
import { Bot } from 'grammy';

async function main() {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken || botToken.trim() === '') {
    console.error('❌ Error: BOT_TOKEN is not configured in environment variables.');
    process.exit(1);
  }

  console.log('Menghapus webhook dari Telegram Bot API...');

  try {
    const bot = new Bot(botToken.trim());
    const result = await bot.api.deleteWebhook();

    if (result) {
      console.log('✅ Webhook Telegram berhasil dihapus.');
    } else {
      console.error('❌ Gagal menghapus webhook (Telegram API mengembalikan false).');
      process.exit(1);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Terjadi kesalahan saat menghapus webhook:', message);
    process.exit(1);
  }
}

main();
