import { APIRequestContext } from "@playwright/test";
import { AuthApi } from "@services/api/controllers/auth-api";
import { AdminApi } from "@services/api/controllers/admin-api";
import { GamesApi } from "@services/api/controllers/games-api";

export class ApiFacade {
  readonly auth: AuthApi;
  readonly admin: AdminApi;
  /** Games catalog arrange/cleanup helper and request builder entry point - see games-api.ts. */
  readonly games: GamesApi;

  constructor(request: APIRequestContext) {
    this.auth = new AuthApi(request);
    this.admin = new AdminApi(request);
    this.games = new GamesApi(request);
  }
}
