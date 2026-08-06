import { APIRequestContext } from "@playwright/test";
import { Endpoints } from "@services/api/endpoints";
import { ApiResult, toApiResult } from "@services/api/types/api-result";
import {
  AdminErrorResponse,
  CreateAdminRequest,
  CreateAdminResponse,
  DeleteAdminResponse,
  ListAdminsResponse,
} from "@services/api/types/admin";

export type ListAdminsApiResult = ApiResult<
  ListAdminsResponse | AdminErrorResponse
>;
export type CreateAdminApiResult = ApiResult<
  CreateAdminResponse | AdminErrorResponse
>;
export type DeleteAdminApiResult = ApiResult<
  DeleteAdminResponse | AdminErrorResponse
>;

/**
 * Fluent builder for /api/admin requests. Every `with*` method returns the
 * builder, the `send*` methods perform the call and return the result.
 * All /api/admin routes are owner-only, so a bearer token is required.
 */
export class AdminRequestBuilder {
  private body: Partial<CreateAdminRequest> = {};
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

  withConfirmPassword(confirmPassword: string): this {
    this.body.confirmPassword = confirmPassword;
    return this;
  }

  /** Sets `password` and `confirmPassword` to the same value. */
  withMatchingPassword(password: string): this {
    return this.withPassword(password).withConfirmPassword(password);
  }

  withBody(body: Partial<CreateAdminRequest>): this {
    this.body = { ...this.body, ...body };
    return this;
  }

  /** Sends the payload as-is, bypassing the CreateAdminRequest shape. */
  withRawBody(body: unknown): this {
    this.rawBody = body;
    return this;
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

  async sendListAdmins(): Promise<ListAdminsApiResult> {
    const response = await this.request.get(Endpoints.admin.users, {
      headers: this.headers,
    });

    return toApiResult<ListAdminsResponse | AdminErrorResponse>(response);
  }

  async sendCreateAdmin(): Promise<CreateAdminApiResult> {
    const response = await this.request.post(Endpoints.admin.users, {
      data: this.rawBody !== undefined ? this.rawBody : this.body,
      headers: this.headers,
    });

    return toApiResult<CreateAdminResponse | AdminErrorResponse>(response);
  }

  async sendDeleteAdmin(id: string): Promise<DeleteAdminApiResult> {
    const response = await this.request.delete(Endpoints.admin.userById(id), {
      headers: this.headers,
    });

    return toApiResult<DeleteAdminResponse | AdminErrorResponse>(response);
  }

  // #endregion
}
