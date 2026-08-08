import { Locator, Page } from "@playwright/test";

/**
 * Public games listing (/). Each game card renders its name as a level-3
 * heading; the listing paginates, unlike the admin Games Management table.
 */
export class HomePage {
  readonly navigation: Locator;
  readonly logoutButton: Locator;
  readonly gameNameHeadings: Locator;
  readonly nextPageButton: Locator;

  constructor(private readonly page: Page) {
    this.navigation = page.getByRole("navigation");
    this.logoutButton = page.getByRole("button", { name: "Logout" });
    this.gameNameHeadings = page.getByRole("heading", { level: 3 });
    this.nextPageButton = page.getByRole("button", { name: "Next" });
  }

  async goto() {
    await this.page.goto("/", { waitUntil: "domcontentloaded" });
  }

  /** The card heading for one game, by its exact name. */
  headingFor(name: string): Locator {
    return this.page.getByRole("heading", { level: 3, name, exact: true });
  }

  /** Game names on the page currently rendered, in card order. */
  async gameNamesOnCurrentPage(): Promise<string[]> {
    // The listing fetches its games after mount; wait for the first card before
    // reading, or an empty read silently reports a page with no games on it.
    await this.gameNameHeadings.first().waitFor();
    const headings = await this.gameNameHeadings.allInnerTexts();

    return headings.map((heading) => heading.trim());
  }

  /**
   * Every game name in the catalogue, collected by paging with Next until it is
   * disabled. The independent oracle for the admin table's contents - there is
   * no games API to query against.
   */
  async allGameNames(): Promise<string[]> {
    const names: string[] = [];

    for (;;) {
      const pageNames = await this.gameNamesOnCurrentPage();
      names.push(...pageNames);

      if (await this.nextPageButton.isDisabled()) {
        return names;
      }

      // Pagination is client-side, so there is no response to wait on. Waiting
      // for a heading we just read to detach is what proves the re-render
      // finished - polling here would mean an assertion, and page objects hold
      // none. Any heading on this page serves: all of them are replaced.
      const lastHeadingRead = this.headingFor(pageNames[pageNames.length - 1]);
      await this.nextPageButton.click();
      await lastHeadingRead.waitFor({ state: "detached" });
    }
  }
}
