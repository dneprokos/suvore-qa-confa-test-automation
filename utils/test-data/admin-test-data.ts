import { CreateAdminRequest } from "@services/api/types/admin";

/**
 * Test data for the throwaway admins the suite creates and deletes.
 *
 * Generated e-mails are unique per test run and carry a stream prefix so the
 * API and the UI specs can never collide on a record. They are kept free of
 * dots and plus signs because the server runs `normalizeEmail()` on create,
 * which would otherwise rewrite the address and break the cleanup lookup.
 */
export class AdminTestData {
  /** Password used for the throwaway admins created by the tests. */
  static readonly DEFAULT_PASSWORD = "Test12345@";

  /** Exactly 6 characters - the inclusive lower boundary of the rule. */
  static readonly MIN_LENGTH_PASSWORD = "Ab1@xy";

  /** 5 characters - one below the minimum. */
  static readonly TOO_SHORT_PASSWORD = "Ab1@x";

  /** A syntactically valid ObjectId that belongs to no document. */
  static readonly UNUSED_OBJECT_ID = "000000000000000000000000";

  private static readonly API_EMAIL_PREFIX = "apiadmin";
  private static readonly UI_EMAIL_PREFIX = "uiadmin";

  static uniqueEmail(prefix: string): string {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return `${prefix}${suffix}@example.com`;
  }

  /** Unique e-mail for an admin created by an API spec. */
  static uniqueApiEmail(): string {
    return this.uniqueEmail(this.API_EMAIL_PREFIX);
  }

  /** Unique e-mail for an admin created by a UI spec. */
  static uniqueUiEmail(): string {
    return this.uniqueEmail(this.UI_EMAIL_PREFIX);
  }

  /**
   * A valid create-admin payload. The e-mail is a parameter rather than
   * generated here, because the spec needs the value to register it in the
   * `createdAdminEmails` cleanup fixture before the request is sent.
   */
  static createAdminPayload(
    email: string,
    overrides: Partial<CreateAdminRequest> = {},
  ): CreateAdminRequest {
    return {
      email,
      password: this.DEFAULT_PASSWORD,
      confirmPassword: this.DEFAULT_PASSWORD,
      ...overrides,
    };
  }
}
