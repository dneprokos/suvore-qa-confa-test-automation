import { Locator, Page, Response } from "@playwright/test";
import { Endpoints } from "@services/api/endpoints";

/** Column order of the "Games Management" table (/admin). */
const GameColumn = {
  name: 0,
  genre: 1,
  year: 2,
  platforms: 3,
  multiplayer: 4,
  actions: 5,
} as const;

/**
 * One rendered row of the games management table - the AC-1/FR-10.1 data
 * columns as they appear on screen. `year` is the release-year cell as
 * rendered, not the full release date the API carries.
 */
export type GameRow = {
  name: string;
  genre: string;
  year: string;
  platforms: string;
  multiplayer: string;
};

/**
 * Admin Panel games management table (/admin). Reachable by both Admin and
 * Owner sessions (FR-10.1). The page ships no `data-testid` attributes, like
 * the Owner Panel (pages/owner-page.ts); every locator here is role-based.
 */
export class GamesManagementPage {
  readonly pageTitle: Locator;
  readonly addGameButton: Locator;
  readonly gamesTable: Locator;
  readonly gameRows: Locator;

  /** Whether the dialog handler registered by `acceptNextConfirmDialog()` actually fired. */
  private confirmDialogShown = false;

  constructor(private readonly page: Page) {
    this.pageTitle = page.getByRole("heading", { name: "ADMIN PANEL" });
    this.addGameButton = page.getByRole("button", {
      name: "Add Game",
      exact: true,
    });
    this.gamesTable = page.getByRole("table");
    // The second rowgroup is the table body; the first one holds the headers.
    this.gameRows = this.gamesTable
      .getByRole("rowgroup")
      .nth(1)
      .getByRole("row");
  }

  /**
   * The table's own catalogue request - GET /api/games exactly, matched on
   * the pathname so GET /api/games/{id} (the public detail page) can never
   * satisfy it.
   */
  private static isGamesListResponse(response: Response): boolean {
    return (
      new URL(response.url()).pathname === Endpoints.games.list &&
      response.request().method() === "GET"
    );
  }

  /** A single-game request - /api/games/{id} under the given verb. */
  private static isGameByIdResponse(
    response: Response,
    method: "GET" | "DELETE",
  ): boolean {
    return (
      new URL(response.url()).pathname.startsWith(`${Endpoints.games.list}/`) &&
      response.request().method() === method
    );
  }

  async goto() {
    await this.page.goto("/admin", { waitUntil: "domcontentloaded" });
  }

  /**
   * Loads /admin and returns the table's own GET /api/games response, so a
   * spec can gate on its status and read the catalogue the table rendered
   * from. Returned rather than asserted on: assertions live in the spec.
   */
  async gotoAndWaitForGames(): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(GamesManagementPage.isGamesListResponse),
      this.goto(),
    ]);

    return response;
  }

  /**
   * Selects the game's name in the table (FR-10.3), which navigates to its
   * public detail page, and returns the GET /api/games/{id} response that
   * page fires.
   */
  async openGameDetail(name: string): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse((response) =>
        GamesManagementPage.isGameByIdResponse(response, "GET"),
      ),
      this.nameLinkFor(name).click(),
    ]);

    return response;
  }

  /**
   * Invokes Delete for `name` and accepts the native confirmation, returning
   * the DELETE /api/games/{id} response. The dialog handler is registered
   * before the click, or Playwright dismisses the dialog and the request
   * never fires; whether the dialog actually appeared is readable through
   * `wasConfirmDialogShown()`.
   */
  async deleteGame(name: string): Promise<Response> {
    this.acceptNextConfirmDialog();

    const [response] = await Promise.all([
      this.page.waitForResponse((response) =>
        GamesManagementPage.isGameByIdResponse(response, "DELETE"),
      ),
      this.deleteButtonFor(name).click(),
    ]);

    return response;
  }

  /**
   * The row for exactly this game. Matched on the name cell's link rather
   * than on the row's text: `hasText` is a substring match, so a batch of
   * generated names ("... -1", "... -10" ... "... -19") would resolve to
   * eleven rows and fail strict mode.
   */
  rowFor(name: string): Locator {
    return this.gameRows.filter({
      has: this.page.getByRole("link", { name, exact: true }),
    });
  }

  cellFor(name: string, column: keyof typeof GameColumn): Locator {
    return this.rowFor(name).getByRole("cell").nth(GameColumn[column]);
  }

  nameLinkFor(name: string): Locator {
    return this.rowFor(name).getByRole("link", { name, exact: true });
  }

  editButtonFor(name: string): Locator {
    return this.rowFor(name).getByRole("button", { name: "Edit" });
  }

  deleteButtonFor(name: string): Locator {
    return this.rowFor(name).getByRole("button", { name: "Delete" });
  }

  /**
   * Every rendered row, top row first, read one row at a time - a spec
   * asserts on the returned properties instead of re-locating each cell,
   * so the table is read once rather than once per column per row.
   *
   * The values are a snapshot, so they do not retry the way a locator
   * assertion does: gate the read on `expect(gameRows).toHaveCount(n)`
   * against the count the table's own response carried. A row that renders
   * with an empty cell is then the defect it looks like, not a race - the
   * cells of a row render from the same response as the row itself.
   */
  async allRowValues(): Promise<GameRow[]> {
    // The table fetches its games after mount; wait for the first row before
    // reading any of them, or an empty/partial first read silently loses
    // rows that have not rendered yet - waitForResponse resolves when the
    // network response arrives, not when React has finished re-rendering it.
    await this.gameRows.first().waitFor();
    const rows = await this.gameRows.all();

    return Promise.all(rows.map((row) => GamesManagementPage.readRow(row)));
  }

  /** The rendered values of one game's row. */
  async rowValues(name: string): Promise<GameRow> {
    return GamesManagementPage.readRow(this.rowFor(name));
  }

  private static async readRow(row: Locator): Promise<GameRow> {
    const cells = (await row.getByRole("cell").allInnerTexts()).map((cell) =>
      cell.trim(),
    );

    // A column the row never rendered reads as "" rather than undefined, so
    // a missing cell fails the assertion that names it instead of throwing
    // somewhere else.
    return {
      name: cells[GameColumn.name] ?? "",
      genre: cells[GameColumn.genre] ?? "",
      year: cells[GameColumn.year] ?? "",
      platforms: cells[GameColumn.platforms] ?? "",
      multiplayer: cells[GameColumn.multiplayer] ?? "",
    };
  }

  /**
   * Deletion is guarded by a native `window.confirm` (AC-1 / Epic SCRUM-93:
   * "Deletion shall always require confirmation."). Registered before the
   * click, since Playwright dismisses an unhandled dialog and the DELETE
   * request would never fire. Also records that the dialog actually
   * appeared, so a spec can assert the confirmation gate fired rather than
   * assume it.
   */
  acceptNextConfirmDialog() {
    this.confirmDialogShown = false;
    this.page.once("dialog", (dialog) => {
      this.confirmDialogShown = true;
      void dialog.accept();
    });
  }

  /** Whether the last `acceptNextConfirmDialog()`-guarded action triggered a native confirm dialog. */
  wasConfirmDialogShown(): boolean {
    return this.confirmDialogShown;
  }
}
