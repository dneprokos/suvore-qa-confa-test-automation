import { APIRequestContext } from "@playwright/test";
import { Endpoints } from "@services/api/endpoints";
import { ApiResult, toApiResult } from "@services/api/types/api-result";
import {
  CreateGameRequest,
  CreateGameResponse,
  DeleteGameResponse,
  GameErrorResponse,
  ListGamesResponse,
} from "@services/api/types/games";

export type CreateGameApiResult = ApiResult<
  CreateGameResponse | GameErrorResponse
>;
export type DeleteGameApiResult = ApiResult<
  DeleteGameResponse | GameErrorResponse
>;
export type ListGamesApiResult = ApiResult<
  ListGamesResponse | GameErrorResponse
>;

/**
 * Fluent builder for /api/games requests. Every `with*` method returns the
 * builder, the `send*` methods perform the call and return the result.
 * POST /api/games and DELETE /api/games/{id} require a bearer token; GET
 * /api/games does not (# API Surface).
 *
 * Used two ways: as UI-stream arrange/cleanup plumbing (short controller
 * calls - see games-api.ts) and, for the SCRUM-132 E2E API scenarios, as the
 * `// Act` of tests/api/games-api.spec.ts, one `with*()` call per field or
 * query parameter the request under test sends.
 */
export class GamesRequestBuilder {
  private body: Partial<CreateGameRequest> = {};
  private rawBody: unknown;
  private headers: Record<string, string> = {};
  private query: Record<string, string | number | boolean> = {};

  constructor(private readonly request: APIRequestContext) {}

  // #region Body

  withName(name: string): this {
    this.body.name = name;
    return this;
  }

  withGenre(genre: string): this {
    this.body.genre = genre;
    return this;
  }

  withPlatforms(platforms: string[]): this {
    this.body.platforms = platforms;
    return this;
  }

  withReleaseDate(releaseDate: string): this {
    this.body.releaseDate = releaseDate;
    return this;
  }

  withHasMultiplayer(hasMultiplayer: boolean): this {
    this.body.hasMultiplayer = hasMultiplayer;
    return this;
  }

  withDescription(description: string): this {
    this.body.description = description;
    return this;
  }

  withImageUrl(imageUrl: string): this {
    this.body.imageUrl = imageUrl;
    return this;
  }

  withRating(rating: number): this {
    this.body.rating = rating;
    return this;
  }

  withBody(body: Partial<CreateGameRequest>): this {
    this.body = { ...this.body, ...body };
    return this;
  }

  /** Sends the payload as-is, bypassing the CreateGameRequest shape. */
  withRawBody(body: unknown): this {
    this.rawBody = body;
    return this;
  }

  // #endregion

  // #region Request shape

  withHeader(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }

  withHeaders(headers: Record<string, string>): this {
    this.headers = { ...this.headers, ...headers };
    return this;
  }

  withBearerToken(token: string): this {
    return this.withHeader("Authorization", `Bearer ${token}`);
  }

  // #endregion

  // #region Query

  withQueryParam(name: string, value: string | number | boolean): this {
    this.query[name] = value;
    return this;
  }

  /** Named sugar for GET /api/games query parameters # API Surface documents. */
  /**
   * Named sugar for the listing's search parameter. `# API Surface` does not
   * document it (GET /api/games' Spec Gaps omit `limit` and `page` too); the
   * parameter was confirmed against the running app during exploration for
   * these tests - the public listing sends it on every keystroke.
   */
  withSearch(search: string): this {
    return this.withQueryParam("search", search);
  }

  withLimit(limit: number): this {
    return this.withQueryParam("limit", limit);
  }

  withPage(page: number): this {
    return this.withQueryParam("page", page);
  }

  // #endregion

  // #region Send request

  async sendCreateGame(): Promise<CreateGameApiResult> {
    const response = await this.request.post(Endpoints.games.list, {
      data: this.rawBody !== undefined ? this.rawBody : this.body,
      headers: this.headers,
    });

    return toApiResult<CreateGameResponse | GameErrorResponse>(response);
  }

  async sendDeleteGame(id: string): Promise<DeleteGameApiResult> {
    const response = await this.request.delete(Endpoints.games.byId(id), {
      headers: this.headers,
    });

    return toApiResult<DeleteGameResponse | GameErrorResponse>(response);
  }

  /** Sends whatever query parameters were set via `with*` above (none by default). */
  async sendListGames(): Promise<ListGamesApiResult> {
    const response = await this.request.get(Endpoints.games.list, {
      params: this.query,
      headers: this.headers,
    });

    return toApiResult<ListGamesResponse | GameErrorResponse>(response);
  }

  // #endregion
}
