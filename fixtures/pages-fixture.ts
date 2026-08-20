import { test as apiTest } from "@fixtures/api-fixture";
import { LoginPage } from "../pages/login-page";
import { HomePage } from "../pages/home-page";
import { OwnerPage } from "../pages/owner-page";
import { GamesManagementPage } from "../pages/games-management-page";
import { GameDetailPage } from "../pages/game-detail-page";
import { AdminTestData } from "@utils/test-data/admin-test-data";
import { LoginResponse } from "@services/api/types/auth";

/** localStorage key the client reads the JWT from (AuthContext). */
const TOKEN_STORAGE_KEY = "token";

type Pages = {
  loginPage: LoginPage;
  homePage: HomePage;
  ownerPage: OwnerPage;
  ownerSession: void;
  gamesManagementPage: GamesManagementPage;
  gameDetailPage: GameDetailPage;
  adminSession: void;
  adminGamesManagementPage: GamesManagementPage;
};

export const test = apiTest.extend<Pages>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  gameDetailPage: async ({ page }, use) => {
    await use(new GameDetailPage(page));
  },

  /**
   * Seeds the owner JWT before the first navigation. AuthContext reads
   * localStorage on mount and then calls GET /api/auth/me, so a token written
   * after `goto` would not restore the session without a reload.
   */
  ownerSession: async ({ context, ownerToken }, use) => {
    await context.addInitScript(
      ([key, token]) => window.localStorage.setItem(key, token),
      [TOKEN_STORAGE_KEY, ownerToken] as const,
    );

    await use();
  },

  /** Depends on ownerSession: the page is already authenticated as owner. */
  ownerPage: async ({ page, ownerSession }, use) => {
    await use(new OwnerPage(page));
  },

  /** Owner-authenticated /admin games management table - FR-10.1's Owner half. */
  gamesManagementPage: async ({ page, ownerSession }, use) => {
    await use(new GamesManagementPage(page));
  },

  /**
   * Genuine Admin-role session for the games management table. `.env` points
   * ADMIN_EMAIL at the same address as OWNER_EMAIL, so a token obtained
   * through `api.auth.loginAsAdmin()` is actually an owner token (see
   * docs/automation/etalons/api-spec-etalon.md's environment note) - a throwaway
   * admin account is created over the API instead, so the session this
   * fixture seeds is a real Admin, not Owner in disguise. Registered for
   * cleanup the instant it is created, before `use()` hands control back.
   */
  adminSession: async (
    { context, api, ownerToken, createdAdminEmails },
    use,
  ) => {
    const email = AdminTestData.uniqueUiEmail();
    createdAdminEmails.push(email);

    const createResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(email),
    );
    if (!createResult.ok) {
      throw new Error(
        `Admin session seed failed with status ${createResult.status}: ${JSON.stringify(createResult.body)}`,
      );
    }

    const loginResult = await api.auth.login({
      email,
      password: AdminTestData.DEFAULT_PASSWORD,
    });
    if (!loginResult.ok) {
      throw new Error(
        `Admin session login failed with status ${loginResult.status}: ${JSON.stringify(loginResult.body)}`,
      );
    }

    await context.addInitScript(
      ([key, token]) => window.localStorage.setItem(key, token),
      [TOKEN_STORAGE_KEY, (loginResult.body as LoginResponse).token] as const,
    );

    await use();
  },

  /** Depends on adminSession: the page is already authenticated as a genuine Admin. */
  adminGamesManagementPage: async ({ page, adminSession }, use) => {
    await use(new GamesManagementPage(page));
  },
});

export { expect } from "@playwright/test";
