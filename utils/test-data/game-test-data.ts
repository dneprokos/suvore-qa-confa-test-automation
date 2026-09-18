import { CreateGameRequest } from "@services/api/types/games";

/**
 * Test data for the throwaway games both suites create and delete over the
 * API - the UI suite to arrange a games management table scenario
 * (SCRUM-132), the API suite to own the data its searches match.
 *
 * Generated names are unique per test run, mirroring AdminTestData's
 * `uniqueUiEmail()`, so parallel games-management tests never collide on
 * the same row.
 */
export class GameTestData {
  private static readonly UI_NAME_PREFIX = "UI Test Game";

  // Defaults used by createGamePayload() below, exposed so a spec can assert
  // against the exact value it sent instead of re-typing it as a second,
  // driftable literal.
  static readonly DEFAULT_GENRE = "Action";
  static readonly DEFAULT_PLATFORM = "PC";
  /**
   * A second, distinct valid platform value - used where a scenario needs a
   * platforms array of two or more entries (SCRUM-115 SCN-001). Confirmed
   * against `# API Surface`'s documented `POST /api/games` platforms enum.
   */
  static readonly DEFAULT_SECOND_PLATFORM = "PlayStation";
  static readonly DEFAULT_RELEASE_YEAR = "1990";
  static readonly DEFAULT_HAS_MULTIPLAYER = true;

  /** Calendar month names, index 0 = January - backs `formattedReleaseDate` below. */
  private static readonly MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // A conservatively large batch - well past any plausible public-listing page
  // size - used to seed a catalogue that exceeds it without needing the exact
  // threshold, which FR-10.2 leaves unstated (REQ-M2). See SCN-018.
  static readonly LARGE_CATALOGUE_BATCH_SIZE = 30;

  // The `limit` used to read the catalogue in one request - the derived
  // load mechanism named in the requirements' Dependencies section (comment:
  // "GET /api/games?limit=1000&page=1 - the table loads the full catalogue
  // in one request"), not a value stated by FR-10.2 itself (REQ-M2). Named
  // here so GamesApi.totalGameCount and any spec reading the whole catalogue
  // in one page reference the same value instead of a repeated literal.
  static readonly FULL_CATALOGUE_PAGE_SIZE = 1000;

  /**
   * A search term no catalogue game can match - hardcoded rather than read
   * back from the API, since proving a name is absent needs no request:
   * every seeded and shipped game name is a real title or carries the
   * UI_NAME_PREFIX above, and this matches neither.
   */
  static readonly NON_EXISTENT_GAME_NAME = "ZzzNonExistentGame12345";

  /**
   * A search term made only of regex metacharacters. The listing interpolates
   * the term into a regular expression without escaping it, so this one is
   * not a name to match but a fragment of a pattern - see the defect tests in
   * tests/api/games-search-api.spec.ts.
   */
  static readonly REGEX_SPECIAL_SEARCH_TERM = "(";

  /** A term that matches every name once interpolated into a regex unescaped. */
  static readonly REGEX_WILDCARD_SEARCH_TERM = ".*";

  /**
   * A `GET /api/games/<id>` path id that is not a valid Mongo ObjectId
   * shape - the requirements' own example for the malformed-id case
   * (FR-05.17 / SCRUM-115 SCN-009).
   */
  static readonly MALFORMED_GAME_ID = "not-an-id";

  /**
   * A token unique to one test run and free of regex metacharacters, so a
   * search scenario matches the games it seeded itself and nothing else in
   * the shared catalog. `Zx` keeps it clear of the shipped catalog's titles.
   */
  static uniqueSearchToken(): string {
    return `Zx${Date.now()}${Math.floor(Math.random() * 1000)}`;
  }

  /** The name of one seeded search fixture: the token, then fixed filler. */
  static searchSeedName(token: string, index = 0): string {
    return `${token} Search Seed ${index}`;
  }

  static createSearchSeedPayload(
    token: string,
    overrides: Partial<CreateGameRequest> = {},
  ): CreateGameRequest {
    return this.createGamePayload(this.searchSeedName(token), overrides);
  }

  /** `count` search fixtures sharing one token, so a search on it returns all of them. */
  static createSearchSeedPayloadBatch(
    token: string,
    count: number,
  ): CreateGameRequest[] {
    return Array.from({ length: count }, (_, index) =>
      this.createGamePayload(this.searchSeedName(token, index)),
    );
  }

  /**
   * A search fixture whose `descriptionToken` appears in the description and
   * nowhere in the name - the data a scenario needs to prove which field the
   * search reads.
   */
  static createDescriptionTokenPayload(
    nameToken: string,
    descriptionToken: string,
  ): CreateGameRequest {
    return this.createSearchSeedPayload(nameToken, {
      description: `Seeded by the API automation suite. ${descriptionToken}`,
    });
  }

  /**
   * Formats an ISO `YYYY-MM-DD` release date per the detail page's stated
   * `<Month> <D>, <YYYY>` pattern (SCRUM-115 SCN-001/SCN-011's `Expected:`),
   * so a spec asserts the Released field against the exact value it sent
   * instead of re-typing the pattern. Parses the parts directly rather than
   * through `Date`, so no local timezone can shift the day across a UTC
   * midnight boundary.
   */
  static formattedReleaseDate(releaseDate: string): string {
    const [year, month, day] = releaseDate.split("-").map(Number);
    return `${this.MONTH_NAMES[month - 1]} ${day}, ${year}`;
  }

  static uniqueGameName(): string {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return `${this.UI_NAME_PREFIX} ${suffix}`;
  }

  /**
   * `count` create-game payloads with names guaranteed unique within the
   * batch. Two calls to `uniqueGameName()` in a tight loop can collide on
   * the same millisecond; this embeds the loop index instead.
   */
  static createGamePayloadBatch(count: number): CreateGameRequest[] {
    const runId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return Array.from({ length: count }, (_, index) =>
      this.createGamePayload(`${this.UI_NAME_PREFIX} ${runId}-${index}`),
    );
  }

  /**
   * A valid create-game payload under a freshly generated unique name.
   *
   * The seeding path wants exactly this and nothing more: `seedGame` reads the
   * name back off the payload for its cleanup label, so a spec that never
   * asserts on the name has no reason to hold one. Use `createGamePayload`
   * when the spec does assert on it, or needs the same name twice.
   */
  static uniqueGamePayload(
    overrides: Partial<CreateGameRequest> = {},
  ): CreateGameRequest {
    return this.createGamePayload(this.uniqueGameName(), overrides);
  }

  /**
   * A valid create-game payload under a caller-supplied name. The name is a
   * parameter rather than generated here so a spec that asserts on the
   * rendered name can send a value it already holds - same shape as
   * `AdminTestData.createAdminPayload`.
   */
  static createGamePayload(
    name: string,
    overrides: Partial<CreateGameRequest> = {},
  ): CreateGameRequest {
    return {
      name,
      genre: this.DEFAULT_GENRE,
      platforms: [this.DEFAULT_PLATFORM],
      releaseDate: `${this.DEFAULT_RELEASE_YEAR}-06-15`,
      hasMultiplayer: this.DEFAULT_HAS_MULTIPLAYER,
      description: "Seeded by the UI automation suite.",
      imageUrl: "https://example.com/placeholder-game.jpg",
      rating: 7.5,
      ...overrides,
    };
  }
}
