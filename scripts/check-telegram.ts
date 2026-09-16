import 'dotenv/config';
import { Bot } from 'grammy';

async function main() {
  const botToken = process.env.BOT_TOKEN;

  if (!botToken || botToken.trim() === '') {
    console.log('Telegram API:\nFAIL\n\nAlasan:\nBOT_TOKEN belum dikonfigurasi di environment variable.');
    process.exit(1);
  }

  try {
    const bot = new Bot(botToken.trim());
    const me = await bot.api.getMe();

    console.log('Telegram API:\nPASS\n');
    console.log(`Bot:\n@${me.username || 'tidak ada username'}\n`);
    console.log(`Bot Name:\n${me.first_name}${me.last_name ? ' ' + me.last_name : ''}`);
    process.exit(0);
  } catch (err: unknown) {
    const safeError = err instanceof Error ? err.message : String(err);
    console.log('Telegram API:\nFAIL\n');
    console.log(`Alasan:\n${safeError}`);
    process.exit(1);
  }
}

main();
