import { Locator, Page } from "@playwright/test";

export class HomePage {
  readonly navigation: Locator;
  readonly logoutButton: Locator;

  constructor(private readonly page: Page) {
    this.navigation = page.getByRole("navigation");
    this.logoutButton = page.getByRole("button", { name: "Logout" });
  }
}
