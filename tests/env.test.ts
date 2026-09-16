import { describe, it, expect } from 'vitest';
import { validateEnv, isEnvConfigured } from '../src/utils/env';

describe('Environment Configuration Validator', () => {
  const originalEnv = { ...process.env };

  it('should return false for isEnvConfigured when required env vars are missing', () => {
    delete process.env.BOT_TOKEN;
    delete process.env.WEBHOOK_SECRET;
    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(isEnvConfigured()).toBe(false);
  });

  it('should throw an error in validateEnv when required variables are absent', () => {
    delete process.env.BOT_TOKEN;
    expect(() => validateEnv()).toThrow('Environment validation failed');
  });

  it('should validate and parse configuration with defaults when required variables are present', () => {
    process.env.BOT_TOKEN = '123456:mock_token';
    process.env.WEBHOOK_SECRET = 'mock_secret_123';
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_mock';
    delete process.env.MAX_FILE_SIZE_MB;

    const config = validateEnv();
    expect(config.BOT_TOKEN).toBe('123456:mock_token');
    expect(config.WEBHOOK_SECRET).toBe('mock_secret_123');
    expect(config.BLOB_READ_WRITE_TOKEN).toBe('vercel_blob_rw_mock');
    expect(config.MAX_FILE_SIZE_MB).toBe(50);
    expect(config.TELEGRAM_MAX_FILE_SIZE_MB).toBe(20);
    expect(config.MAX_CONCURRENT_DOWNLOADS).toBe(2);

    // Restore env
    process.env = { ...originalEnv };
  });
});
