import { Locator, Page } from "@playwright/test";

/**
 * Public game detail page (/game/:id), reached by selecting a game's name
 * in the games management table (FR-10.3). No auth session is required.
 */
export class GameDetailPage {
  constructor(private readonly page: Page) {}

  /** The page's title heading - the game's name, rendered as an <h1>. */
  headingFor(name: string): Locator {
    return this.page.getByRole("heading", { level: 1, name, exact: true });
  }
}
