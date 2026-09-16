import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseRednoteHtml, extractPostIdFromUrl } from '../src/rednote/parser';
import { RednoteMediaNotFoundError, RednoteParseError } from '../src/rednote/errors';

describe('RedNote HTML Parser', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');

  it('should parse valid public video metadata', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'rednote-video.html'), 'utf-8');
    const result = parseRednoteHtml(html, 'https://www.xiaohongshu.com/explore/65a000000000000001000001');

    expect(result.id).toBe('65a000000000000001000001');
    expect(result.title).toBe('Tutorial Masak Enak');
    expect(result.description).toBe('Resep masakan lezat dan mudah');
    expect(result.author).toBe('Chef Red');
    expect(result.authorId).toBe('user123');
    expect(result.media.length).toBe(1);
    expect(result.media[0]).toEqual({
      type: 'video',
      url: 'https://sns-video-qc.xhscdn.com/stream/v1/video.mp4',
      width: 1080,
      height: 1920,
      mimeType: 'video/mp4',
    });
    expect(result.canonicalUrl).toBe('https://www.xiaohongshu.com/explore/65a000000000000001000001');
  });

  it('should parse image post metadata', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'rednote-image.html'), 'utf-8');
    const result = parseRednoteHtml(html, 'https://www.xiaohongshu.com/explore/65a000000000000002000002');

    expect(result.id).toBe('65a000000000000002000002');
    expect(result.title).toBe('Foto Estetik Hari Ini');
    expect(result.author).toBe('Photographer X');
    expect(result.media.length).toBe(1);
    expect(result.media[0]).toEqual({
      type: 'image',
      url: 'https://sns-webpic-qc.xhscdn.com/20240101/image1.jpg',
      width: 1080,
      height: 1440,
      mimeType: 'image/jpeg',
    });
  });

  it('should parse gallery posts preserving exact order', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'rednote-gallery.html'), 'utf-8');
    const result = parseRednoteHtml(html, 'https://www.xiaohongshu.com/explore/65a000000000000003000003');

    expect(result.media.length).toBe(3);
    expect(result.media[0].url).toBe('https://sns-webpic-qc.xhscdn.com/gallery/img1.jpg');
    expect(result.media[1].url).toBe('https://sns-webpic-qc.xhscdn.com/gallery/img2.jpg');
    expect(result.media[2].url).toBe('https://sns-webpic-qc.xhscdn.com/gallery/img3.jpg');
  });

  it('should deduplicate media if duplicates exist while preserving order', () => {
    const htmlWithDuplicates = `
      <!DOCTYPE html>
      <html>
        <head><title>Duplicate Test</title></head>
        <body>
          <script>
            window.__INITIAL_STATE__ = {
              note: {
                noteDetailMap: {
                  "noteDup": {
                    note: {
                      title: "Dups",
                      imageList: [
                        { urlDefault: "https://sns-webpic-qc.xhscdn.com/item1.jpg" },
                        { urlDefault: "https://sns-webpic-qc.xhscdn.com/item2.jpg" },
                        { urlDefault: "https://sns-webpic-qc.xhscdn.com/item1.jpg" },
                        { urlDefault: "https://sns-webpic-qc.xhscdn.com/item3.jpg" },
                        { urlDefault: "https://sns-webpic-qc.xhscdn.com/item2.jpg" }
                      ]
                    }
                  }
                }
              }
            };
          </script>
        </body>
      </html>
    `;

    const result = parseRednoteHtml(htmlWithDuplicates, 'https://www.xiaohongshu.com/explore/noteDup');
    expect(result.media.length).toBe(3);
    expect(result.media.map((m) => m.url)).toEqual([
      'https://sns-webpic-qc.xhscdn.com/item1.jpg',
      'https://sns-webpic-qc.xhscdn.com/item2.jpg',
      'https://sns-webpic-qc.xhscdn.com/item3.jpg',
    ]);
  });

  it('should throw RednoteMediaNotFoundError when no media is found', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'rednote-no-media.html'), 'utf-8');
    expect(() => parseRednoteHtml(html, 'https://www.xiaohongshu.com/explore/65a000000000000004000004')).toThrow(
      RednoteMediaNotFoundError
    );
  });

  it('should fallback gracefully to Open Graph when script JSON is malformed', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'rednote-malformed.html'), 'utf-8');
    const result = parseRednoteHtml(html, 'https://www.xiaohongshu.com/explore/65a000000000000005000005');

    expect(result.title).toBe('Judul Fallback OpenGraph');
    expect(result.description).toBe('Deskripsi fallback dari OpenGraph');
    expect(result.media.length).toBe(1);
    expect(result.media[0].type).toBe('video');
    expect(result.media[0].url).toBe('https://sns-video-qc.xhscdn.com/fallback/video.mp4');
  });

  it('should throw RednoteParseError on empty or invalid input', () => {
    expect(() => parseRednoteHtml('', 'https://www.xiaohongshu.com/explore/123')).toThrow(
      RednoteParseError
    );
  });

  it('should correctly extract post ID from different canonical URL formats', () => {
    expect(extractPostIdFromUrl('https://www.xiaohongshu.com/explore/65abc1234567890abcdef012')).toBe(
      '65abc1234567890abcdef012'
    );
    expect(extractPostIdFromUrl('https://www.xiaohongshu.com/discovery/item/65abc1234567890abcdef012')).toBe(
      '65abc1234567890abcdef012'
    );
    expect(extractPostIdFromUrl('https://www.xiaohongshu.com/other')).toBeUndefined();
    expect(extractPostIdFromUrl('not-a-valid-url')).toBeUndefined();
  });
});
