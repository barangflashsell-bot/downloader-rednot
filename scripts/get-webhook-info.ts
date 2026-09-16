import 'dotenv/config';
import { Bot } from 'grammy';

async function main() {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken || botToken.trim() === '') {
    console.error('❌ Error: BOT_TOKEN is not configured in environment variables.');
    process.exit(1);
  }

  try {
    const bot = new Bot(botToken.trim());
    const info = await bot.api.getWebhookInfo();

    console.log('📋 Telegram Webhook Info:');
    console.log(`• URL                  : ${info.url || '(belum ada webhook yang didaftarkan)'}`);
    console.log(`• Pending Updates      : ${info.pending_update_count}`);
    console.log(`• Custom Certificate   : ${info.has_custom_certificate}`);
    if (info.ip_address) {
      console.log(`• IP Address           : ${info.ip_address}`);
    }
    if (info.max_connections) {
      console.log(`• Max Connections      : ${info.max_connections}`);
    }
    if (info.last_error_date) {
      const errorDate = new Date(info.last_error_date * 1000).toISOString();
      console.log(`• Last Error Date      : ${errorDate}`);
    }
    if (info.last_error_message) {
      console.log(`• Last Error Message   : ${info.last_error_message}`);
    }
    if (info.last_synchronization_error_date) {
      const syncDate = new Date(info.last_synchronization_error_date * 1000).toISOString();
      console.log(`• Last Sync Error Date : ${syncDate}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Gagal mengambil informasi webhook:', message);
    process.exit(1);
  }
}

main();
