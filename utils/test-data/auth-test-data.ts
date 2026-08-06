/**
 * Invalid credential values shared by the API and the UI specs.
 *
 * Valid credentials are never duplicated here - they live in `Config` and come
 * from `.env`.
 */
export class AuthTestData {
  /** Well-formed password that belongs to no account. */
  static readonly INVALID_PASSWORD = "Test12345";

  /** Fails e-mail format validation. */
  static readonly MALFORMED_EMAIL = "not-an-email";

  /** Bearer token that is not a JWT at all. */
  static readonly MALFORMED_TOKEN = "not-a-jwt";
}
