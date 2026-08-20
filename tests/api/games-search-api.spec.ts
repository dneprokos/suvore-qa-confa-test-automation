import { test, expect } from "@fixtures/api-fixture";
import { ListGamesResponse } from "@services/api/types/games";
import { GameTestData } from "@utils/test-data/game-test-data";

/**
 * GET /api/games' `search` parameter. `# API Surface` documents neither it
 * nor `limit`/`page`, so every mechanic asserted here was confirmed against
 * the running app first: the term filters on the game name only, matches a
 * substring, ignores case, and is interpolated into a regular expression
 * without being escaped - the last of which is the defect the final two
 * tests report.
 *
 * The catalog is shared and not test-isolated, so every scenario searches on
 * a token it seeded itself (`GameTestData.uniqueSearchToken()`) rather than
 * on a shipped title, and reads the response's own pagination metadata as
 * the count oracle instead of assuming the catalog's size.
 */
test.describe("GET /api/games?search=", () => {
  test("Search games - Should return the game whose name matches the term exactly", async ({
    api,
    ownerToken,
    seedGame,
  }) => {
    // Arrange - two seeds under different tokens, so a term matching only
    // one of them proves filtering rather than an empty catalog
    const token = GameTestData.uniqueSearchToken();
    const matchingGame = await seedGame(
      GameTestData.createSearchSeedPayload(token),
    );
    const otherGame = await seedGame(
      GameTestData.createSearchSeedPayload(GameTestData.uniqueSearchToken()),
    );

    // Act
    const result = await api.games
      .gamesBuilder()
      .withBearerToken(ownerToken)
      .withSearch(matchingGame.name)
      .withLimit(GameTestData.FULL_CATALOGUE_PAGE_SIZE)
      .withPage(1)
      .sendListGames();

    // Assert
    expect(result.status).toBe(200);
    const body = result.body as ListGamesResponse;
    expect(body.games.map((game) => game.name)).toEqual([matchingGame.name]);
    expect(body.games.map((game) => game._id)).not.toContain(otherGame.id);
    // The metadata counts the whole filtered set, not this page of it, so it
    // rules out a second match that landed off-page.
    expect(body.pagination.totalGames).toBe(1);
  });

  test("Search games - Should match a name substring regardless of case", async ({
    api,
    ownerToken,
    seedGame,
  }) => {
    // Arrange - the token is a substring of the seeded name, never the whole
    // of it, so a term that only ever matched whole names would fail here
    const token = GameTestData.uniqueSearchToken();
    const seededGame = await seedGame(
      GameTestData.createSearchSeedPayload(token),
    );
    expect(seededGame.name).toContain(token);

    // Act
    const result = await api.games
      .gamesBuilder()
      .withBearerToken(ownerToken)
      .withSearch(token.toUpperCase())
      .withLimit(GameTestData.FULL_CATALOGUE_PAGE_SIZE)
      .withPage(1)
      .sendListGames();

    // Assert - the upper-cased token still matches the mixed-case name
    expect(result.status).toBe(200);
    const body = result.body as ListGamesResponse;
    expect(body.games.map((game) => game.name)).toEqual([seededGame.name]);
    expect(body.pagination.totalGames).toBe(1);
  });

  test("Search games - Should match the name only, not the description", async ({
    api,
    ownerToken,
    seedGame,
  }) => {
    // Arrange - one seed carrying a token in its description and nowhere in
    // its name
    const nameToken = GameTestData.uniqueSearchToken();
    const descriptionToken = GameTestData.uniqueSearchToken();
    const seededGame = await seedGame(
      GameTestData.createDescriptionTokenPayload(nameToken, descriptionToken),
    );

    // Act - the term is the description's token, which no name carries
    const result = await api.games
      .gamesBuilder()
      .withBearerToken(ownerToken)
      .withSearch(descriptionToken)
      .withLimit(GameTestData.FULL_CATALOGUE_PAGE_SIZE)
      .withPage(1)
      .sendListGames();

    // Assert - the description token matches nothing, while the same seed is
    // reachable by its name. The positive control is what makes the empty
    // result a field scope rather than a seed that never landed.
    expect(result.status).toBe(200);
    expect((result.body as ListGamesResponse).games).toEqual([]);
    expect((result.body as ListGamesResponse).pagination.totalGames).toBe(0);

    const byName = await api.games.listGames(ownerToken, {
      search: nameToken,
      limit: GameTestData.FULL_CATALOGUE_PAGE_SIZE,
      page: 1,
    });
    expect(byName.status).toBe(200);
    expect(
      (byName.body as ListGamesResponse).games.map((game) => game._id),
    ).toEqual([seededGame.id]);
  });

  test("Search games - Should match the name only, not the genre", async ({
    api,
    ownerToken,
    seedGame,
  }) => {
    // Arrange - one seed carrying the default genre, which its name does not
    // repeat
    const nameToken = GameTestData.uniqueSearchToken();
    const seededGame = await seedGame(
      GameTestData.createSearchSeedPayload(nameToken),
    );
    expect(seededGame.name).not.toContain(GameTestData.DEFAULT_GENRE);

    // Act - the term is the genre the seed carries
    const result = await api.games
      .gamesBuilder()
      .withBearerToken(ownerToken)
      .withSearch(GameTestData.DEFAULT_GENRE)
      .withLimit(GameTestData.FULL_CATALOGUE_PAGE_SIZE)
      .withPage(1)
      .sendListGames();

    // Assert - the genre never reaches the seed, which its own name still
    // does. Written as an absence of this one id rather than an empty page:
    // a shipped title carrying the genre word in its name is a legitimate
    // match, and asserting zero results would fail on it.
    expect(result.status).toBe(200);
    expect(
      (result.body as ListGamesResponse).games.map((game) => game._id),
    ).not.toContain(seededGame.id);

    const byName = await api.games.listGames(ownerToken, {
      search: nameToken,
      limit: GameTestData.FULL_CATALOGUE_PAGE_SIZE,
      page: 1,
    });
    expect(byName.status).toBe(200);
    expect(
      (byName.body as ListGamesResponse).games.map((game) => game._id),
    ).toEqual([seededGame.id]);
  });

  test("Search games - Should return an empty page rather than an error when nothing matches", async ({
    api,
    ownerToken,
  }) => {
    // Arrange - a term no name can carry; nothing is seeded, since the
    // scenario is about the absence of matches
    const unmatchedToken = GameTestData.uniqueSearchToken();

    // Act
    const result = await api.games
      .gamesBuilder()
      .withBearerToken(ownerToken)
      .withSearch(unmatchedToken)
      .withLimit(GameTestData.FULL_CATALOGUE_PAGE_SIZE)
      .withPage(1)
      .sendListGames();

    // Assert - an empty result is a 200 with an empty page, not a 404
    expect(result.status).toBe(200);
    const body = result.body as ListGamesResponse;
    expect(body.games).toEqual([]);
    expect(body.pagination.totalGames).toBe(0);
    expect(body.pagination.hasNextPage).toBe(false);
  });

  test("Search games - Should paginate the matches, counting every match in the metadata", async ({
    api,
    ownerToken,
    seedGame,
  }) => {
    // Arrange - three games under one token, read back two at a time
    const token = GameTestData.uniqueSearchToken();
    const payloads = GameTestData.createSearchSeedPayloadBatch(token, 3);
    const seededIds: string[] = [];
    for (const payload of payloads) {
      seededIds.push((await seedGame(payload)).id);
    }

    // Act
    const firstPage = await api.games
      .gamesBuilder()
      .withBearerToken(ownerToken)
      .withSearch(token)
      .withLimit(2)
      .withPage(1)
      .sendListGames();

    // Assert - the page holds the requested slice while the metadata counts
    // the whole filtered set, so the search is applied before the paging
    expect(firstPage.status).toBe(200);
    const firstBody = firstPage.body as ListGamesResponse;
    expect(firstBody.games).toHaveLength(2);
    expect(firstBody.pagination.totalGames).toBe(seededIds.length);
    expect(firstBody.pagination.totalPages).toBe(2);
    expect(firstBody.pagination.currentPage).toBe(1);
    expect(firstBody.pagination.hasNextPage).toBe(true);
    expect(firstBody.pagination.hasPrevPage).toBe(false);

    const secondPage = await api.games
      .gamesBuilder()
      .withBearerToken(ownerToken)
      .withSearch(token)
      .withLimit(2)
      .withPage(2)
      .sendListGames();
    expect(secondPage.status).toBe(200);
    const secondBody = secondPage.body as ListGamesResponse;
    expect(secondBody.games).toHaveLength(1);
    expect(secondBody.pagination.hasNextPage).toBe(false);

    // Across both pages the search returned exactly the three seeded games,
    // each once - the check a per-page count alone cannot make.
    const returnedIds = [...firstBody.games, ...secondBody.games].map(
      (game) => game._id,
    );
    expect([...returnedIds].sort()).toEqual([...seededIds].sort());
  });

  test("Search games - Should serve a search to a caller with no token", async ({
    api,
    seedGame,
  }) => {
    // Arrange
    const token = GameTestData.uniqueSearchToken();
    const seededGame = await seedGame(
      GameTestData.createSearchSeedPayload(token),
    );

    // Act - no Authorization header: the public listing is unauthenticated
    // (# API Surface: GET /api/games requires no token, unlike POST/DELETE)
    const result = await api.games
      .gamesBuilder()
      .withSearch(token)
      .withLimit(GameTestData.FULL_CATALOGUE_PAGE_SIZE)
      .withPage(1)
      .sendListGames();

    // Assert
    expect(result.status).toBe(200);
    expect(
      (result.body as ListGamesResponse).games.map((game) => game._id),
    ).toEqual([seededGame.id]);
  });

  // Known application defect - the term is interpolated into a regular
  // expression without being escaped, so a term that is not a valid pattern
  // crashes the endpoint. Asserted against the specification (a client-
  // supplied term either matches nothing or is rejected as invalid input),
  // not against the observed 500: weakening it would hide the defect.
  test("Search games - Should not fail with a server error on a term made of regex metacharacters", async ({
    api,
    ownerToken,
  }) => {
    // Arrange - nothing to seed; the term itself is the input under test

    // Act
    const result = await api.games
      .gamesBuilder()
      .withBearerToken(ownerToken)
      .withSearch(GameTestData.REGEX_SPECIAL_SEARCH_TERM)
      .withLimit(GameTestData.FULL_CATALOGUE_PAGE_SIZE)
      .withPage(1)
      .sendListGames();

    // Assert - either outcome is defensible; a 500 is not one of them
    expect([200, 400]).toContain(result.status);
  });

  // Known application defect, same root cause as the test above read from
  // the other side: an unescaped term is a pattern rather than a literal, so
  // ".*" matches every name and the filter is bypassed instead of returning
  // the games whose names contain those two characters - none.
  test("Search games - Should treat a wildcard term as literal text rather than a pattern", async ({
    api,
    ownerToken,
    seedGame,
  }) => {
    // Arrange - one seed, so the catalog provably holds a game the term must
    // still not match
    const token = GameTestData.uniqueSearchToken();
    const seededGame = await seedGame(
      GameTestData.createSearchSeedPayload(token),
    );
    expect(seededGame.name).not.toContain(
      GameTestData.REGEX_WILDCARD_SEARCH_TERM,
    );

    // Act
    const result = await api.games
      .gamesBuilder()
      .withBearerToken(ownerToken)
      .withSearch(GameTestData.REGEX_WILDCARD_SEARCH_TERM)
      .withLimit(GameTestData.FULL_CATALOGUE_PAGE_SIZE)
      .withPage(1)
      .sendListGames();

    // Assert - no name contains the literal characters ".*"
    expect(result.status).toBe(200);
    expect((result.body as ListGamesResponse).games).toEqual([]);
    expect((result.body as ListGamesResponse).pagination.totalGames).toBe(0);
  });
});
