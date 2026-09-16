/**
 * Base class for all RedNote extractor errors.
 */
export class RednoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RednoteError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the provided URL is malformed or invalid.
 */
export class RednoteInvalidUrlError extends RednoteError {
  constructor(message = 'Invalid RedNote URL provided.') {
    super(message);
    this.name = 'RednoteInvalidUrlError';
  }
}

/**
 * Thrown when the URL domain is not in the allowed RedNote domains list.
 */
export class RednoteUnsupportedUrlError extends RednoteError {
  constructor(message = 'Unsupported URL domain or protocol.') {
    super(message);
    this.name = 'RednoteUnsupportedUrlError';
  }
}

/**
 * Thrown when resolving a short URL fails, redirects to an untrusted domain, or exceeds limits.
 */
export class RednoteResolveError extends RednoteError {
  constructor(message = 'Failed to resolve RedNote short URL.') {
    super(message);
    this.name = 'RednoteResolveError';
  }
}

/**
 * Thrown when the public page cannot be accessed (e.g. requires login, CAPTCHA, or not found).
 */
export class RednoteAccessError extends RednoteError {
  constructor(message = 'Unable to access public RedNote content without authentication.') {
    super(message);
    this.name = 'RednoteAccessError';
  }
}

/**
 * Thrown when no downloadable media (video or images) could be found in the public post.
 */
export class RednoteMediaNotFoundError extends RednoteError {
  constructor(message = 'No public video or image media found in this RedNote post.') {
    super(message);
    this.name = 'RednoteMediaNotFoundError';
  }
}

/**
 * Thrown when network request to fetch the public page fails or times out.
 */
export class RednoteNetworkError extends RednoteError {
  constructor(message = 'Network error while fetching RedNote public page.') {
    super(message);
    this.name = 'RednoteNetworkError';
  }
}

/**
 * Thrown when HTML or embedded metadata cannot be parsed.
 */
export class RednoteParseError extends RednoteError {
  constructor(message = 'Failed to parse RedNote post metadata.') {
    super(message);
    this.name = 'RednoteParseError';
  }
}
