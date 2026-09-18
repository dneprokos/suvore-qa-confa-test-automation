import { Locator, Page, Response } from "@playwright/test";
import { Endpoints } from "@services/api/endpoints";

/**
 * Public game detail page (/game/:id) - reachable either by clicking a
 * catalogue card (FR-05.13/FR-05.14, `pages/home-page.ts`'s `openGameDetail`)
 * or by a direct URL, since the route is public and requires no
 * authentication (FR-05.15). On load it requests `GET /api/games/<id>` and,
 * on 200, renders the eight FR-05.16 fields; on 404 it renders the
 * not-found state instead (FR-05.17).
 */
export class GameDetailPage {
  readonly backToGamesLink: Locator;
  readonly genre: Locator;
  readonly released: Locator;
  readonly multiplayer: Locator;
  readonly rating: Locator;
  readonly platforms: Locator;
  /**
   * One rendered tag per `platforms` array element.
   *
   * LOCATOR-FALLBACK: tier 4 - each platform tag renders as a plain `<span>`
   * with no role, label or `data-testid` of its own (confirmed by `eval`
   * during exploration for SCRUM-115: `<span class="...">PC</span>`, no
   * distinguishing attribute). Scoped under the tier-1 `game-platforms`
   * container (`data-testid`), this is the only way to count the rendered
   * entries rather than merely read the container's combined text.
   */
  readonly platformEntries: Locator;
  readonly description: Locator;
  /**
   * The "Created by" field.
   *
   * LOCATOR-FALLBACK: tier 4 - this block carries no role, label, id or
   * `data-testid` at any level up to its enclosing section (confirmed by
   * `eval` during exploration for SCRUM-115: the rendered markup is
   * `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm
   * text-arcade-text"><div><span class="font-bold">Created by:</span>
   * Unknown</div></div>`, with no ancestor `data-testid` either).
   * `.grid.grid-cols-1` is the only structural hook the markup offers, and
   * it resolves to exactly one element on this page (confirmed by `eval`:
   * `document.querySelectorAll('.grid.grid-cols-1').length === 1`).
   */
  readonly createdBy: Locator;
  /**
   * The not-found block's own wrapper (`data-testid="error-message"`,
   * confirmed by `eval` during exploration for SCRUM-115) - scopes
   * `notFoundHeading` and `notFoundMessage` to the block that owns them, so
   * neither can resolve against a paragraph or heading rendered by the
   * found state (etalon Appendix "The empty-state locators are scoped to
   * the block that owns them"; `pages/home-page.ts`'s `noResults`).
   */
  readonly notFoundBlock: Locator;
  readonly notFoundHeading: Locator;
  readonly notFoundMessage: Locator;

  constructor(private readonly page: Page) {
    this.backToGamesLink = page.getByRole("link", { name: "Back to Games" });
    this.genre = page.getByTestId("game-genre");
    this.released = page.getByTestId("game-release-date");
    this.multiplayer = page.getByTestId("game-multiplayer");
    this.rating = page.getByTestId("game-rating");
    this.platforms = page.getByTestId("game-platforms");
    // LOCATOR-FALLBACK: tier 4 - see the field comment above.
    this.platformEntries = this.platforms.locator("span");
    this.description = page.getByTestId("game-description");
    // LOCATOR-FALLBACK: tier 4 - see the field comment above.
    this.createdBy = page.locator(".grid.grid-cols-1");
    this.notFoundBlock = page.getByTestId("error-message");
    this.notFoundHeading = this.notFoundBlock.getByRole("heading", {
      level: 2,
      name: "Game Not Found",
    });
    this.notFoundMessage = this.notFoundBlock.getByRole("paragraph");
  }

  /** The page's title heading - the game's name, rendered as an <h1>. */
  headingFor(name: string): Locator {
    return this.page.getByRole("heading", { level: 1, name, exact: true });
  }

  async goto(id: string) {
    await this.page.goto(`/game/${id}`, { waitUntil: "domcontentloaded" });
  }

  /** A single-game request - `/api/games/{id}` exactly, under GET. */
  private static isGameDetailResponse(response: Response, id: string): boolean {
    return (
      new URL(response.url()).pathname === Endpoints.games.byId(id) &&
      response.request().method() === "GET"
    );
  }

  /**
   * Loads `/game/<id>` directly - a typed or bookmarked URL, never a
   * catalogue click - and returns the page's own `GET /api/games/<id>`
   * response, so a spec can gate on its status before reading the rendered
   * result.
   */
  async gotoAndWaitForGame(id: string): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse((response) =>
        GameDetailPage.isGameDetailResponse(response, id),
      ),
      this.goto(id),
    ]);

    return response;
  }
}
