import type { VercelRequest, VercelResponse } from '@vercel/node';
import { webhookCallback } from 'grammy';
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
 * Vercel Serverless Function adapter for grammY webhookCallback.
 */
const vercelNodeAdapter = (req: VercelRequest, res: VercelResponse) => ({
  update: Promise.resolve(
    typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  ),
  header: (req.headers['x-telegram-bot-api-secret-token'] as string) || undefined,
  end: () => res.end(),
  respond: (json: string) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(json);
  },
  unauthorized: () => {
    res.status(401).json({ error: 'Unauthorized' });
  },
});

let cachedWebhookHandler: ((req: VercelRequest, res: VercelResponse) => unknown) | null = null;

function getWebhookHandler(): (req: VercelRequest, res: VercelResponse) => unknown {
  if (!cachedWebhookHandler) {
    const bot = getBot();
    cachedWebhookHandler = webhookCallback(bot, vercelNodeAdapter);
  }
  return cachedWebhookHandler;
}

/**
 * Main Telegram Webhook Handler for Vercel Serverless Functions.
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
    const handleUpdate = getWebhookHandler();
    await handleUpdate(req, res);
  } catch (error) {
    console.error('[Webhook Error] Error processing Telegram update:', error);
    if (!res.writableEnded) {
      res.status(200).json({ ok: true });
    }
  }
}
