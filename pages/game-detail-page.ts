import { Locator, Page, Response } from "@playwright/test";
import { Endpoints } from "@services/api/endpoints";

/**
 * Public game detail page (/game/:id), reached by selecting a game's name
 * in the games management table (FR-10.3) or a catalogue card (FR-05.13).
 * No auth session is required. Every field ships a data-testid; the
 * not-found state is a single `error-message` block.
 */
export class GameDetailPage {
  readonly name: Locator;
  readonly genre: Locator;
  readonly releaseDate: Locator;
  readonly multiplayer: Locator;
  readonly rating: Locator;
  readonly platforms: Locator;
  readonly platformEntries: Locator;
  readonly description: Locator;
  readonly notFound: Locator;
  readonly notFoundHeading: Locator;
  readonly notFoundMessage: Locator;
  readonly notFoundBackLink: Locator;
  /** The level-1 heading, whatever game it names. */
  readonly heading: Locator;
  /** Any "Created by" line, whoever the creator is. */
  readonly createdByLabel: Locator;

  constructor(private readonly page: Page) {
    this.name = page.getByTestId("game-name");
    this.genre = page.getByTestId("game-genre");
    this.releaseDate = page.getByTestId("game-release-date");
    this.multiplayer = page.getByTestId("game-multiplayer");
    this.rating = page.getByTestId("game-rating");
    this.platforms = page.getByTestId("game-platforms");
    // LOCATOR-FALLBACK: tier 4 — each platform chip is a bare <span> inside the
    // game-platforms block. eval of the block's markup showed no role, no
    // accessible name, no data-testid, no id and no data-* attribute on a chip,
    // so tiers 1-3 are impossible; scoped to the testid block so it cannot match
    // anything elsewhere on the page.
    this.platformEntries = this.platforms.locator("span");
    this.description = page.getByTestId("game-description");
    // The not-found block replaces the whole page body; its parts are scoped to
    // it so none can resolve against the navigation bar.
    this.notFound = page.getByTestId("error-message");
    this.notFoundHeading = this.notFound.getByRole("heading", { level: 2 });
    this.notFoundMessage = this.notFound.getByRole("paragraph");
    this.notFoundBackLink = this.notFound.getByRole("link", {
      name: "Back to Games",
      exact: true,
    });
    this.heading = page.getByRole("heading", { level: 1 });
    // LOCATOR-FALLBACK: text match on the design-stated "Created by" label — the
    // line ships no role, no testid and no id (observed in the previous
    // iteration's snapshot), so tiers 1-3 are impossible. The label is named in
    // the design's Expected, not marketing copy.
    this.createdByLabel = page.getByText("Created by", { exact: false });
  }

  /** The page's title heading - the game's name, rendered as an <h1>. */
  headingFor(name: string): Locator {
    return this.page.getByRole("heading", { level: 1, name, exact: true });
  }

  /**
   * The "Created by" line for a given creator. The line ships no testid and
   * no role, so it is matched on its label plus the creator, which is what
   * makes it resolve to nothing for a different creator.
   */
  createdByFor(creator: string): Locator {
    return this.page.getByText(`Created by: ${creator}`, { exact: true });
  }

  /**
   * Opens /game/<id> directly and returns the GET /api/games/<id> response
   * the page fires on load.
   */
  async goto(id: string): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === Endpoints.games.byId(id) &&
          response.request().method() === "GET",
      ),
      this.page.goto(`/game/${id}`, { waitUntil: "domcontentloaded" }),
    ]);

    return response;
  }
}
