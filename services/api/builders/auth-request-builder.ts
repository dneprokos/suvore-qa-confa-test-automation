import { APIRequestContext } from "@playwright/test";
import { Config } from "@framework/configuration/config";
import { Endpoints } from "@services/api/endpoints";
import { ApiResult, toApiResult } from "@services/api/types/api-result";
import {
  LoginErrorResponse,
  LoginRequest,
  LoginResponse,
} from "@services/api/types/auth";

export type LoginApiResult = ApiResult<LoginResponse | LoginErrorResponse>;

/**
 * Fluent builder for /api/auth requests. Every `with*` method returns the
 * builder, the `send*` methods perform the call and return the result.
 */
export class AuthRequestBuilder {
  private body: Partial<LoginRequest> = {};
  private rawBody: unknown;
  private headers: Record<string, string> = {};

  constructor(private readonly request: APIRequestContext) {}

  // #region Body

  withEmail(email: string): this {
    this.body.email = email;
    return this;
  }

  withPassword(password: string): this {
    this.body.password = password;
    return this;
  }

  withBody(body: Partial<LoginRequest>): this {
    this.body = { ...this.body, ...body };
    return this;
  }

  /** Sends the payload as-is, bypassing the LoginRequest shape. */
  withRawBody(body: unknown): this {
    this.rawBody = body;
    return this;
  }

  withOwnerCredentials(): this {
    return this.withBody({
      email: Config.OWNER_EMAIL,
      password: Config.OWNER_PASSWORD,
    });
  }

  withAdminCredentials(): this {
    return this.withBody({
      email: Config.ADMIN_EMAIL,
      password: Config.ADMIN_PASSWORD,
    });
  }

  // #endregion

  // #region Request shape

  withHeader(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }

  withHeaders(headers: Record<string, string>): this {
    this.headers = { ...this.headers, ...headers };
    return this;
  }

  withBearerToken(token: string): this {
    return this.withHeader("Authorization", `Bearer ${token}`);
  }

  // #endregion

  // #region Send request

  async sendLogin(): Promise<LoginApiResult> {
    const response = await this.request.post(Endpoints.auth.login, {
      data: this.rawBody !== undefined ? this.rawBody : this.body,
      headers: this.headers,
    });

    return toApiResult<LoginResponse | LoginErrorResponse>(response);
  }

  // #endregion
}
