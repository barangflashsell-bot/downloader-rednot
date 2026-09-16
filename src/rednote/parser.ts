import * as cheerio from 'cheerio';
import { RednoteMedia, RednotePost } from './types';
import { RednoteMediaNotFoundError, RednoteParseError } from './errors';
import { validateMediaUrl } from './media-validator';

/**
 * Extracts note ID from a RedNote / Xiaohongshu canonical URL.
 */
export function extractPostIdFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    // Pattern: /explore/:id or /discovery/item/:id
    const exploreMatch = pathname.match(/\/explore\/([a-zA-Z0-9]+)/);
    if (exploreMatch?.[1]) {
      return exploreMatch[1];
    }

    const discoveryMatch = pathname.match(/\/discovery\/item\/([a-zA-Z0-9]+)/);
    if (discoveryMatch?.[1]) {
      return discoveryMatch[1];
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extracts a complete JSON object starting from the first open brace '{'
 * using balanced brace counting to handle nested objects reliably.
 */
function extractJsonObject(str: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let quoteChar = '';
  let isEscaped = false;

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if (inString) {
      if (char === quoteChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return str.slice(startIndex, i + 1);
      }
    }
  }

  return null;
}

/**
 * Attempts to parse JSON string or JavaScript object literal representation.
 */
function parseStateJson(rawStr: string): Record<string, unknown> | null {
  const cleanStr = rawStr.trim().replace(/;?\s*$/, '');

  // 1. Try standard JSON parse with undefined replacement
  try {
    const sanitized = cleanStr.replace(/:\s*undefined/g, ': null');
    return JSON.parse(sanitized);
  } catch {
    // 2. Handle JS object literals: quote unquoted keys and strip trailing commas
    try {
      const formatted = cleanStr
        .replace(/:\s*undefined/g, ': null')
        .replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":')
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(formatted);
    } catch {
      return null;
    }
  }
}

/**
 * Attempts to extract and parse window.__INITIAL_STATE__ from HTML scripts.
 */
function extractInitialState(html: string): Record<string, unknown> | null {
  const $ = cheerio.load(html);
  let foundState: Record<string, unknown> | null = null;

  $('script').each((_, element) => {
    if (foundState) return;
    const content = $(element).html() || '';

    const marker = 'window.__INITIAL_STATE__';
    const markerIndex = content.indexOf(marker);

    if (markerIndex !== -1) {
      const braceIndex = content.indexOf('{', markerIndex + marker.length);
      if (braceIndex !== -1) {
        const rawJson = extractJsonObject(content, braceIndex);
        if (rawJson) {
          foundState = parseStateJson(rawJson);
        }
      }
    }
  });

  return foundState;
}

/**
 * Parses RedNote public page HTML and returns a structured RednotePost.
 * Pure function: runs completely offline and does not make network requests.
 *
 * @param html - Public HTML document content
 * @param canonicalUrl - Current or resolved canonical URL
 * @returns RednotePost containing verified media
 */
export function parseRednoteHtml(html: string, canonicalUrl: string): RednotePost {
  if (!html || typeof html !== 'string') {
    throw new RednoteParseError('Empty or invalid HTML content received.');
  }

  const $ = cheerio.load(html);

  // Determine canonical URL (prefer <link rel="canonical"> if valid)
  let finalCanonicalUrl = canonicalUrl;
  const canonicalLink = $('link[rel="canonical"]').attr('href');
  if (canonicalLink && (canonicalLink.startsWith('https://') || canonicalLink.startsWith('http://'))) {
    try {
      const parsedLink = new URL(canonicalLink);
      const host = parsedLink.hostname.toLowerCase();
      const isAllowedHost =
        host === 'xiaohongshu.com' ||
        host.endsWith('.xiaohongshu.com') ||
        host === 'rednote.com' ||
        host.endsWith('.rednote.com');

      if (parsedLink.protocol === 'https:' && isAllowedHost) {
        finalCanonicalUrl = canonicalLink;
      }
    } catch {
      // Keep fallback canonicalUrl
    }
  }

interface RednoteStreamItem {
  masterUrl?: string;
  mainUrl?: string;
  backupUrls?: string[];
  width?: number;
  height?: number;
}

interface RednoteImageItem {
  urlDefault?: string;
  urlOriginal?: string;
  infoList?: Array<{ url?: string }>;
  urlPre?: string;
  width?: number;
  height?: number;
}

interface RednoteNoteData {
  noteId?: string;
  id?: string;
  title?: string;
  desc?: string;
  description?: string;
  type?: string;
  user?: {
    nickname?: string;
    name?: string;
    userId?: string;
    id?: string;
  };
  video?: {
    media?: {
      stream?: Record<string, RednoteStreamItem[] | undefined>;
    };
  };
  imageList?: RednoteImageItem[];
}

interface RednoteInitialState {
  note?: {
    firstNoteId?: string;
    noteDetailMap?: Record<string, { note?: RednoteNoteData } | undefined>;
  };
  noteData?: RednoteNoteData;
}

  let extractedPostId = extractPostIdFromUrl(finalCanonicalUrl);
  let title: string | undefined;
  let description: string | undefined;
  let author: string | undefined;
  let authorId: string | undefined;

  const rawMediaList: RednoteMedia[] = [];

  // 1. Try parsing from window.__INITIAL_STATE__
  const initialState = extractInitialState(html) as RednoteInitialState | null;

  if (initialState) {
    const noteState = initialState.note;
    const noteDetailMap = noteState?.noteDetailMap;

    let noteObj: RednoteNoteData | null = null;

    if (noteDetailMap && typeof noteDetailMap === 'object') {
      if (extractedPostId && noteDetailMap[extractedPostId]?.note) {
        noteObj = noteDetailMap[extractedPostId]?.note ?? null;
      } else {
        const firstKey = Object.keys(noteDetailMap)[0];
        if (firstKey && noteDetailMap[firstKey]?.note) {
          noteObj = noteDetailMap[firstKey]?.note ?? null;
          if (!extractedPostId) {
            extractedPostId = firstKey;
          }
        }
      }
    }

    if (!noteObj && noteState?.firstNoteId && noteDetailMap?.[noteState.firstNoteId]?.note) {
      noteObj = noteDetailMap[noteState.firstNoteId]?.note ?? null;
      if (!extractedPostId) {
        extractedPostId = noteState.firstNoteId;
      }
    }

    if (noteObj) {
      title = noteObj.title || noteObj.desc?.slice(0, 60);
      description = noteObj.desc || noteObj.description;
      author = noteObj.user?.nickname || noteObj.user?.name;
      authorId = noteObj.user?.userId || noteObj.user?.id;
      if (noteObj.noteId || noteObj.id) {
        extractedPostId = noteObj.noteId || noteObj.id;
      }

      // Check video stream
      const stream = noteObj.video?.media?.stream;
      if (stream && typeof stream === 'object') {
        const videoFormats = ['h264', 'h265', 'av1'];
        for (const format of videoFormats) {
          const streamList = stream[format];
          if (Array.isArray(streamList)) {
            for (const item of streamList) {
              const videoUrl = item.masterUrl || item.mainUrl || item.backupUrls?.[0];
              if (videoUrl && typeof videoUrl === 'string' && validateMediaUrl(videoUrl)) {
                rawMediaList.push({
                  type: 'video',
                  url: videoUrl,
                  width: item.width,
                  height: item.height,
                  mimeType: 'video/mp4',
                });
                break;
              }
            }
          }
          if (rawMediaList.length > 0) break;
        }
      }

      // If not a video post or video not found, check imageList
      if (rawMediaList.length === 0 && Array.isArray(noteObj.imageList)) {
        for (const img of noteObj.imageList) {
          const imgUrl =
            img.urlDefault ||
            img.urlOriginal ||
            img.infoList?.[0]?.url ||
            img.urlPre;

          if (imgUrl && typeof imgUrl === 'string' && validateMediaUrl(imgUrl)) {
            rawMediaList.push({
              type: 'image',
              url: imgUrl,
              width: img.width,
              height: img.height,
              mimeType: 'image/jpeg',
            });
          }
        }
      }
    }
  }

  // 2. Fallback to Open Graph, JSON-LD, and HTML tags
  if (!title) {
    title =
      $('meta[property="og:title"]').attr('content') ||
      $('title').text().trim() ||
      undefined;
  }

  if (!description) {
    description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      undefined;
  }

  if (!author) {
    author =
      $('meta[name="author"]').attr('content') ||
      $('.author-name').text().trim() ||
      undefined;
  }

  // If no media found yet, check Open Graph tags
  if (rawMediaList.length === 0) {
    const ogVideo =
      $('meta[property="og:video"]').attr('content') ||
      $('meta[property="og:video:url"]').attr('content');

    if (ogVideo && validateMediaUrl(ogVideo)) {
      rawMediaList.push({
        type: 'video',
        url: ogVideo,
        mimeType: 'video/mp4',
      });
    }
  }

  if (rawMediaList.length === 0) {
    // Check multiple og:image tags
    $('meta[property="og:image"]').each((_, el) => {
      const imgUrl = $(el).attr('content');
      if (imgUrl && validateMediaUrl(imgUrl)) {
        rawMediaList.push({
          type: 'image',
          url: imgUrl,
          mimeType: 'image/jpeg',
        });
      }
    });
  }

  // Deduplicate media URLs while preserving order
  const uniqueMedia: RednoteMedia[] = [];
  const seenUrls = new Set<string>();

  for (const item of rawMediaList) {
    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      uniqueMedia.push(item);
    }
  }

  // If no valid media was found, fail honestly without creating fake data
  if (uniqueMedia.length === 0) {
    throw new RednoteMediaNotFoundError();
  }

  return {
    id: extractedPostId,
    title,
    description,
    author,
    authorId,
    media: uniqueMedia,
    canonicalUrl: finalCanonicalUrl,
  };
}
