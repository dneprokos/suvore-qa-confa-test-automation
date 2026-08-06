import { APIRequestContext } from "@playwright/test";
import { AuthApi } from "@services/api/controllers/auth-api";
import { AdminApi } from "@services/api/controllers/admin-api";

export class ApiFacade {
  readonly auth: AuthApi;
  readonly admin: AdminApi;

  constructor(request: APIRequestContext) {
    this.auth = new AuthApi(request);
    this.admin = new AdminApi(request);
  }
}
