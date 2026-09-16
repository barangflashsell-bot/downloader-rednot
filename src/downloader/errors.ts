/**
 * Base class for all media downloader errors.
 */
export class DownloaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloaderError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the media file exceeds the allowed maximum file size limit.
 */
export class RednoteFileTooLargeError extends DownloaderError {
  constructor(message = 'Media file exceeds permissible size limit.') {
    super(message);
    this.name = 'RednoteFileTooLargeError';
  }
}

/**
 * Thrown when the server returns an unsupported or dangerous content type (e.g. text/html, application/json).
 */
export class RednoteInvalidContentTypeError extends DownloaderError {
  constructor(message = 'Invalid or unsupported media content type.') {
    super(message);
    this.name = 'RednoteInvalidContentTypeError';
  }
}

/**
 * Thrown when redirect violates security policies or exceeds maximum allowed redirect hops.
 */
export class RednoteDownloadRedirectError extends DownloaderError {
  constructor(message = 'Download redirect violated security policy or exceeded hop limit.') {
    super(message);
    this.name = 'RednoteDownloadRedirectError';
  }
}

/**
 * Thrown when network request fails, drops, or times out during download.
 */
export class RednoteDownloadNetworkError extends DownloaderError {
  constructor(message = 'Network error occurred while streaming media file.') {
    super(message);
    this.name = 'RednoteDownloadNetworkError';
  }
}

/**
 * Thrown when uploading to persistent storage fails.
 */
export class RednoteStorageError extends DownloaderError {
  constructor(message = 'Failed to store media object in persistent storage.') {
    super(message);
    this.name = 'RednoteStorageError';
  }
}
