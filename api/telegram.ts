import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { getBot } from '../src/bot/bot';

/**
 * Timing-safe string comparison to prevent timing attack leaks.
 */
function timingSafeCompare(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Main Telegram Webhook Handler for Vercel Serverless Functions.
 * Uses bot.handleUpdate() directly for maximum compatibility with Vercel.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = process.env.WEBHOOK_SECRET;

  // If WEBHOOK_SECRET is not configured in environment, fail securely
  if (!webhookSecret || webhookSecret.trim() === '') {
    console.error('[Security] WEBHOOK_SECRET is not configured. Failing securely.');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;

  // Validate secret token from Telegram
  if (!timingSafeCompare(secretHeader, webhookSecret)) {
    console.warn('[Security] Unauthorized webhook request: secret token mismatch.');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const bot = getBot();
    const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    console.log(`[Webhook] Processing update_id: ${update?.update_id}`);

    await bot.handleUpdate(update);

    console.log(`[Webhook] Successfully processed update_id: ${update?.update_id}`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Webhook Error] Error processing Telegram update:', error);
    // Always respond 200 to prevent Telegram from retrying
    if (!res.writableEnded) {
      return res.status(200).json({ ok: true });
    }
  }
}
