import { describe, it, expect } from 'vitest';
import {
  START_MESSAGE,
  HELP_MESSAGE,
  ABOUT_MESSAGE,
  STATUS_MESSAGE,
  PROCESSING_MESSAGE,
  INVALID_URL_MESSAGE,
  ERROR_FALLBACK_MESSAGE,
  createBot,
} from '../src/bot/bot';

describe('Telegram Bot Messages and Configuration', () => {
  it('should throw an error when BOT_TOKEN is not configured', () => {
    const originalToken = process.env.BOT_TOKEN;
    delete process.env.BOT_TOKEN;

    expect(() => createBot('')).toThrow(
      'BOT_TOKEN is not configured in environment variables'
    );

    if (originalToken) {
      process.env.BOT_TOKEN = originalToken;
    }
  });

  it('should initialize successfully with a mock token', () => {
    const mockToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
    const testBot = createBot(mockToken);
    expect(testBot).toBeDefined();
    expect(testBot.token).toBe(mockToken);
  });

  it('should have properly formatted START_MESSAGE', () => {
    expect(START_MESSAGE).toContain('👋 Halo!');
    expect(START_MESSAGE).toContain('Selamat datang di RedNote Downloader Bot.');
    expect(START_MESSAGE).toContain('https://www.xiaohongshu.com/explore/...');
  });

  it('should have properly formatted HELP_MESSAGE covering security & limitations', () => {
    expect(HELP_MESSAGE).toContain('ℹ️ Bantuan');
    expect(HELP_MESSAGE).toContain('xiaohongshu.com');
    expect(HELP_MESSAGE).toContain('xhslink.com');
    expect(HELP_MESSAGE).toContain('konten publik');
    expect(HELP_MESSAGE).toContain('TIDAK membypass CAPTCHA');
  });

  it('should have properly formatted ABOUT_MESSAGE', () => {
    expect(ABOUT_MESSAGE).toContain('ℹ️ RedNote Downloader Bot');
    expect(ABOUT_MESSAGE).toContain('v1.0.0');
    expect(ABOUT_MESSAGE).toContain('Anti-SSRF');
  });

  it('should have properly formatted STATUS_MESSAGE', () => {
    expect(STATUS_MESSAGE).toContain('📊 Status Layanan');
    expect(STATUS_MESSAGE).toContain('Online');
    expect(STATUS_MESSAGE).toContain('Vercel Serverless');
  });

  it('should have properly formatted processing and invalid messages', () => {
    expect(PROCESSING_MESSAGE).toContain('⏳ Memproses link...');
    expect(INVALID_URL_MESSAGE).toContain('❌ Link tidak dikenali.');
    expect(ERROR_FALLBACK_MESSAGE).toContain('❌ Terjadi kesalahan saat memproses pesan.');
  });
});
