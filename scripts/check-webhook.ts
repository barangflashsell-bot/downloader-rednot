import 'dotenv/config';
import { Bot } from 'grammy';

async function main() {
  const botToken = process.env.BOT_TOKEN;

  if (!botToken || botToken.trim() === '') {
    console.log('Webhook:\nFAIL\n\nAlasan:\nBOT_TOKEN belum dikonfigurasi di environment variable.');
    process.exit(1);
  }

  try {
    const bot = new Bot(botToken.trim());
    const info = await bot.api.getWebhookInfo();

    const isConfigured = Boolean(info.url && info.url.trim().length > 0);

    console.log(`Webhook:\n${isConfigured ? 'PASS' : 'FAIL'}\n`);
    console.log(`URL:\n${info.url || '(belum ada webhook terpasang)'}\n`);
    console.log(`Pending Updates:\n${info.pending_update_count}\n`);
    console.log(`Last Error:\n${info.last_error_message || 'none'}`);

    process.exit(isConfigured ? 0 : 1);
  } catch (err: unknown) {
    const safeError = err instanceof Error ? err.message : String(err);
    console.log('Webhook:\nFAIL\n');
    console.log(`Alasan:\n${safeError}`);
    process.exit(1);
  }
}

main();
