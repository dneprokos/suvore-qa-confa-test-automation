import { test, expect } from "@fixtures/api-fixture";
import { ListGamesResponse } from "@services/api/types/games";
import { GameTestData } from "@utils/test-data/game-test-data";

// SCN-020 (Non-Admin, non-Owner caller is refused a game deletion) is not
// automated here: .env points ADMIN_EMAIL at the same address as
// OWNER_EMAIL, and the facade offers no route to sign in as a third,
// non-Admin/non-Owner role. A test asserting 403 for that caller would have
// no way to obtain a token that is honestly neither Admin nor Owner - see
// docs/automation/etalons/api-spec-etalon.md, "Two response shapes, and one
// environment limit".

test.describe("GET /api/games", () => {
  // SCN-015 - the removal is the precondition (DELETE /api/games/{id});
  // the Act is the subsequent read the scenario's Expected: names.
  test("List games - Should no longer include a game after it was deleted", async ({
    api,
    ownerToken,
    seedGame,
  }) => {
    // Arrange - two games, so the removed one is not the catalogue's only
    // entry. `seedGame` registers each removal on `cleanupTasks` before it
    // returns, so both are deleted at teardown whatever this test does with
    // them: `removedGame` by its own DELETE below, with the registered task
    // then a harmless no-op, and `keptGame` by the task alone. It also
    // throws on a seed that produced no usable record, so a broken
    // precondition fails here rather than surfacing later as a wrong result.
    const keptGame = await seedGame(GameTestData.uniqueGamePayload());
    const removedGame = await seedGame(GameTestData.uniqueGamePayload());

    const deleteResult = await api.games.deleteGame(ownerToken, removedGame.id);
    expect(deleteResult.status).toBe(200);

    // Act - the subsequent GET /api/games read the scenario observes
    const result = await api.games
      .gamesBuilder()
      .withBearerToken(ownerToken)
      .withLimit(GameTestData.FULL_CATALOGUE_PAGE_SIZE)
      .withPage(1)
      .sendListGames();

    // Assert - FR-10.1, FR-10.2
    expect(result.status).toBe(200);
    const listedBody = result.body as ListGamesResponse;

    // Independent oracle for read completeness: the response's own
    // pagination metadata proves this one page holds the entire catalogue
    // (no page-limit truncation), so the presence/absence assertions below
    // are not artifacts of either game landing off-page.
    expect(listedBody.pagination.totalGames).toBe(listedBody.games.length);

    const gameIds = listedBody.games.map((game) => game._id);
    expect(gameIds).toContain(keptGame.id);
    expect(gameIds).not.toContain(removedGame.id);
  });
});
