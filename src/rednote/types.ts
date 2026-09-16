export type RednoteMediaType = 'video' | 'image';

export interface RednoteMedia {
  type: RednoteMediaType;
  url: string;
  width?: number;
  height?: number;
  mimeType?: string;
  filename?: string;
}

export interface RednotePost {
  id?: string;
  title?: string;
  description?: string;
  author?: string;
  authorId?: string;
  media: RednoteMedia[];
  canonicalUrl: string;
}
