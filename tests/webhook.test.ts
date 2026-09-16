import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../api/telegram';

describe('Telegram Webhook Endpoint (/api/telegram)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createMockReqRes(options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }) {
    const req = {
      method: options.method ?? 'POST',
      headers: options.headers ?? {},
      body: options.body ?? {},
    } as unknown as VercelRequest;

    let statusCode = 200;
    let jsonResponse: unknown = null;
    let sentResponse: unknown = null;
    let ended = false;

    const res = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(data: unknown) {
        jsonResponse = data;
        ended = true;
        return res;
      },
      send(data: unknown) {
        sentResponse = data;
        ended = true;
        return res;
      },
      setHeader() {
        return res;
      },
      end() {
        ended = true;
        return res;
      },
      get writableEnded() {
        return ended;
      },
      getStatusCode: () => statusCode,
      getJsonResponse: () => jsonResponse,
      getSentResponse: () => sentResponse,
    } as unknown as VercelResponse & {
      getStatusCode: () => number;
      getJsonResponse: () => unknown;
      getSentResponse: () => unknown;
    };

    return { req, res };
  }

  it('should return 405 Method Not Allowed for GET requests', async () => {
    const { req, res } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(res.getStatusCode()).toBe(405);
    expect(res.getJsonResponse()).toEqual({ error: 'Method not allowed' });
  });

  it('should return 401 when WEBHOOK_SECRET is not configured in env', async () => {
    delete process.env.WEBHOOK_SECRET;
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'some-secret' },
    });
    await handler(req, res);
    expect(res.getStatusCode()).toBe(401);
    expect(res.getJsonResponse()).toEqual({ error: 'Unauthorized' });
  });

  it('should return 401 when secret header is missing', async () => {
    process.env.WEBHOOK_SECRET = 'my-webhook-secret-123';
    process.env.BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: {},
    });
    await handler(req, res);
    expect(res.getStatusCode()).toBe(401);
    expect(res.getJsonResponse()).toEqual({ error: 'Unauthorized' });
  });

  it('should return 401 when secret header does not match', async () => {
    process.env.WEBHOOK_SECRET = 'my-webhook-secret-123';
    process.env.BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
    });
    await handler(req, res);
    expect(res.getStatusCode()).toBe(401);
    expect(res.getJsonResponse()).toEqual({ error: 'Unauthorized' });
  });
});
