/** Shapes the API contract guarantees, asserted across the API and UI specs. */
export class ResponsePatterns {
  /** Mongo ObjectId, 24 hex characters. */
  static readonly OBJECT_ID = /^[a-f\d]{24}$/i;

  /** ISO 8601 with milliseconds and a `Z` suffix. */
  static readonly ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  /** Three dot-separated base64url segments. */
  static readonly JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/;
}
