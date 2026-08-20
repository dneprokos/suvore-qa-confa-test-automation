import { APIRequestContext } from "@playwright/test";
import {
  CreateGameApiResult,
  DeleteGameApiResult,
  GamesRequestBuilder,
  ListGamesApiResult,
} from "@services/api/builders/games-request-builder";
import {
  CreateGameRequest,
  CreateGameResponse,
  ListGamesResponse,
} from "@services/api/types/games";
import { ResponsePatterns } from "@utils/response-patterns";

/** Concurrency used when this controller seeds or removes many games at once. */
const DEFAULT_BULK_CONCURRENCY = 25;

/**
 * Arrange/cleanup helper for the games catalog. Every method here is a
 * plumbing helper - the seed, the cross-check, the cleanup - never the Act
 * of a test. tests/ui specs use it as their whole call; tests/api specs use
 * it for `// Arrange` and `// Assert` only, going through `gamesBuilder()`
 * for the request under test (see the class comment on GamesRequestBuilder).
 */
export class GamesApi {
  constructor(private readonly request: APIRequestContext) {}

  /** Entry point for custom requests: headers, partial or malformed bodies. */
  gamesBuilder(): GamesRequestBuilder {
    return new GamesRequestBuilder(this.request);
  }

  async createGame(
    token: string,
    payload: CreateGameRequest,
  ): Promise<CreateGameApiResult> {
    return this.gamesBuilder()
      .withBearerToken(token)
      .withBody(payload)
      .sendCreateGame();
  }

  async deleteGame(token: string, id: string): Promise<DeleteGameApiResult> {
    return this.gamesBuilder().withBearerToken(token).sendDeleteGame(id);
  }

  async listGames(
    token: string,
    params: { limit?: number; page?: number; search?: string } = {},
  ): Promise<ListGamesApiResult> {
    const builder = this.gamesBuilder().withBearerToken(token);
    if (params.limit !== undefined) {
      builder.withLimit(params.limit);
    }
    if (params.page !== undefined) {
      builder.withPage(params.page);
    }
    if (params.search !== undefined) {
      builder.withSearch(params.search);
    }
    return builder.sendListGames();
  }

  /** Total games in the catalog, read from the list endpoint's own pagination metadata. */
  async totalGameCount(token: string): Promise<number> {
    const result = await this.listGames(token, { limit: 1000, page: 1 });
    return (result.body as ListGamesResponse)?.pagination?.totalGames ?? 0;
  }

  /**
   * Creates a single game and returns its id alongside the raw result, so a
   * spec can assert the seed status and register cleanup without parsing
   * the response shape itself.
   */
  async createGameAndGetId(
    token: string,
    payload: CreateGameRequest,
  ): Promise<{ result: CreateGameApiResult; id?: string }> {
    const result = await this.createGame(token, payload);
    const id = result.ok ? GamesApi.extractGameId(result.body) : undefined;

    return { result, id };
  }

  /**
   * Creates every payload over the API, in batches, and returns the ids of
   * the games that were actually created. Used to bring a shared, non-test-
   * isolated catalog up to a specific total size (e.g. SCN-011's 1000-game
   * boundary) without a bulk-create route.
   *
   * A payload whose request never succeeded created nothing and is dropped
   * with no further consequence. A payload whose request succeeded (`ok`)
   * but whose id could not be read back from the response *did* create a
   * game - it is counted in `createdWithoutId` rather than silently dropped,
   * so a caller can still report it (e.g. push it to `uncleanableResources`)
   * instead of leaking it untracked.
   */
  async createManyGames(
    token: string,
    payloads: CreateGameRequest[],
    concurrency: number = DEFAULT_BULK_CONCURRENCY,
  ): Promise<{ ids: string[]; createdWithoutId: number }> {
    const ids: string[] = [];
    let createdWithoutId = 0;

    for (let i = 0; i < payloads.length; i += concurrency) {
      const batch = payloads.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((payload) => this.createGame(token, payload)),
      );

      for (const result of results) {
        if (result.ok) {
          const id = GamesApi.extractGameId(result.body);
          if (id) {
            ids.push(id);
          } else {
            createdWithoutId += 1;
          }
        }
      }
    }

    return { ids, createdWithoutId };
  }

  /**
   * Removes every id over the API, in batches. A failed delete only warns -
   * this mirrors `cleanupTasks`' own warning-only contract, since it is
   * meant to be called from inside a single registered cleanup task.
   */
  async deleteManyGames(
    token: string,
    ids: string[],
    concurrency: number = DEFAULT_BULK_CONCURRENCY,
  ): Promise<void> {
    for (let i = 0; i < ids.length; i += concurrency) {
      const batch = ids.slice(i, i + concurrency);
      await Promise.all(
        batch.map((id) =>
          this.deleteGame(token, id).catch((error) =>
            console.warn(`[cleanup] Deleting game ${id} threw: ${String(error)}`),
          ),
        ),
      );
    }
  }

  /**
   * Reads a created game's id from the response. POST /api/games's 201
   * carries no documented schema (# API Surface Spec Gaps); the shape used
   * here (`{ message, game: { _id, ... } }`) was confirmed against a live
   * response during exploration for this ticket.
   */
  private static extractGameId(body: unknown): string | undefined {
    if (!body || typeof body !== "object") {
      return undefined;
    }

    const candidate = (body as Partial<CreateGameResponse>).game?._id;

    return typeof candidate === "string" &&
      ResponsePatterns.OBJECT_ID.test(candidate)
      ? candidate
      : undefined;
  }
}
