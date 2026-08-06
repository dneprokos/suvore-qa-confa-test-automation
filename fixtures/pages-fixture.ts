import { test as apiTest } from "@fixtures/api-fixture";
import { LoginPage } from "../pages/login-page";
import { HomePage } from "../pages/home-page";
import { OwnerPage } from "../pages/owner-page";

/** localStorage key the client reads the JWT from (AuthContext). */
const TOKEN_STORAGE_KEY = "token";

type Pages = {
  loginPage: LoginPage;
  homePage: HomePage;
  ownerPage: OwnerPage;
  ownerSession: void;
};

export const test = apiTest.extend<Pages>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
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
});

export { expect } from "@playwright/test";
