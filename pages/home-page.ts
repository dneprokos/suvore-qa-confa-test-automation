import { Locator, Page, Response } from "@playwright/test";
import { Endpoints } from "@services/api/endpoints";

/**
 * Public games listing (/). Each game card renders its name as a level-3
 * heading; the listing paginates, unlike the admin Games Management table.
 * The search box filters server-side: the listing re-requests GET /api/games
 * with a `search` query parameter every time its value changes.
 */
export class HomePage {
  readonly navigation: Locator;
  readonly logoutButton: Locator;
  readonly gameNameHeadings: Locator;
  readonly nextPageButton: Locator;
  readonly searchInput: Locator;
  readonly noResults: Locator;
  readonly noResultsHeading: Locator;
  readonly noResultsMessage: Locator;

  constructor(private readonly page: Page) {
    this.navigation = page.getByRole("navigation");
    this.logoutButton = page.getByRole("button", { name: "Logout" });
    this.gameNameHeadings = page.getByRole("heading", { level: 3 });
    this.nextPageButton = page.getByRole("button", { name: "Next" });
    this.searchInput = page.getByTestId("search-input");
    // The empty-state block replaces the card grid; its heading and message
    // are scoped to it so neither can resolve against the page banner.
    this.noResults = page.getByTestId("no-results");
    this.noResultsHeading = this.noResults.getByRole("heading", { level: 2 });
    this.noResultsMessage = this.noResults.getByRole("paragraph");
  }

  async goto() {
    await this.page.goto("/", { waitUntil: "domcontentloaded" });
  }

  /** The card heading for one game, by its exact name. */
  headingFor(name: string): Locator {
    return this.page.getByRole("heading", { level: 3, name, exact: true });
  }

  /**
   * Types `term` into the search box and returns the GET /api/games response
   * the listing fires for it. Filling the box is the whole action - the
   * listing searches on value change and ships no submit control.
   */
  async searchFor(term: string): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse((response) =>
        HomePage.isGamesSearchResponse(response, term),
      ),
      this.searchInput.fill(term),
    ]);

    return response;
  }

  /**
   * The listing's catalogue request for exactly this term - matched on the
   * pathname and on the `search` parameter's value, so neither the
   * unfiltered request the page fires on mount (`search=`) nor a request
   * carrying a different term can satisfy it.
   */
  private static isGamesSearchResponse(
    response: Response,
    term: string,
  ): boolean {
    const url = new URL(response.url());

    return (
      url.pathname === Endpoints.games.list &&
      response.request().method() === "GET" &&
      url.searchParams.get("search") === term
    );
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
