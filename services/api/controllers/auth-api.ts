import { APIRequestContext } from "@playwright/test";
import {
  AuthRequestBuilder,
  LoginApiResult,
} from "@services/api/builders/auth-request-builder";
import { LoginRequest } from "@services/api/types/auth";

export class AuthApi {
  constructor(private readonly request: APIRequestContext) {}

  /** Entry point for custom requests: headers, partial or malformed bodies. */
  loginBuilder(): AuthRequestBuilder {
    return new AuthRequestBuilder(this.request);
  }

  async login(payload: LoginRequest): Promise<LoginApiResult> {
    return this.loginBuilder().withBody(payload).sendLogin();
  }

  async loginAsOwner(): Promise<LoginApiResult> {
    return this.loginBuilder().withOwnerCredentials().sendLogin();
  }

  async loginAsAdmin(): Promise<LoginApiResult> {
    return this.loginBuilder().withAdminCredentials().sendLogin();
  }
}
