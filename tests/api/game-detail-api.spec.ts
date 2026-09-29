import { test, expect } from "@fixtures/api-fixture";
import { GameDetailResponse } from "@services/api/types/game-detail";
import { GameErrorResponse, ListGamesResponse } from "@services/api/types/games";
import { GameTestData } from "@utils/test-data/game-test-data";

test.describe("GET /api/games/{id}", () => {
  // SCN-008 - the list read is the precondition that produces the `_id` the
  // card link is built from; the detail request is the Act.
  test("Game detail - Should resolve an id taken from the public list without credentials", async ({
    api,
    seedGame,
  }) => {
    // Arrange - a seeded game guarantees the list holds at least one game and
    // gives the detail request an id that no parallel spec deletes. The list is
    // the full public catalogue (no search filter), requested without
    // credentials, as a guest's browser does.
    const token = GameTestData.uniqueSearchToken();
    const seeded = await seedGame(GameTestData.createSearchSeedPayload(token));

    const listResult = await api.games
      .gamesBuilder()
      .withLimit(GameTestData.FULL_CATALOGUE_PAGE_SIZE)
      .withPage(1)
      .sendListGames();
    expect(listResult.status).toBe(200);
    const listed = (listResult.body as ListGamesResponse).games;
    const listedEntry = listed.find((game) => game._id === seeded.id);
    expect(listedEntry).toBeDefined();

    // Act - no withBearerToken: the detail request is public
    const result = await api.games
      .gamesBuilder()
      .sendGetGame(listedEntry!._id);

    // Assert - FR-05.14: every listed game carries an _id. FR-05.15, FR-05.16,
    // AC-1: 200 and the eight named fields, no field type or createdBy shape
    // asserted (the design states none). The live 200 wraps the game under
    // `game`, as POST /api/games does; the surface documents no schema.
    for (const game of listed) {
      expect(game._id).toEqual(expect.any(String));
    }
    expect(result.status).toBe(200);
    const detail = (result.body as GameDetailResponse).game;
    expect(detail).toEqual(
      expect.objectContaining({
        name: listedEntry!.name,
        genre: expect.anything(),
        releaseDate: expect.anything(),
        hasMultiplayer: expect.anything(),
        rating: expect.anything(),
        platforms: expect.anything(),
        description: expect.anything(),
      }),
    );
    expect(detail).toHaveProperty("createdBy");
  });

  // SCN-009
  test("Game detail - Should return 404 with the not-found body for the id of a deleted game", async ({
    api,
    ownerToken,
    seedGame,
  }) => {
    // Arrange - seedGame registers the removal, so the DELETE below leaves a
    // harmless no-op at teardown. The id is well-formed and matches no game.
    const removed = await seedGame(GameTestData.uniqueGamePayload());
    const deleteResult = await api.games.deleteGame(ownerToken, removed.id);
    expect(deleteResult.status).toBe(200);

    // Act - no withBearerToken
    const result = await api.games.gamesBuilder().sendGetGame(removed.id);

    // Assert - FR-05.17, AC-2
    expect(result.status).toBe(404);
    expect(result.body as GameErrorResponse).toEqual({
      message: "Game not found",
    });
  });

  // SCN-010
  test("Game detail - Should return 404 with the not-found body for a malformed id", async ({
    api,
  }) => {
    // Arrange - nothing is created, so nothing needs cleanup

    // Act - no withBearerToken
    const result = await api.games
      .gamesBuilder()
      .sendGetGame(GameTestData.MALFORMED_GAME_ID);

    // Assert - FR-05.17, AC-3
    expect(result.status).toBe(404);
    expect(result.body as GameErrorResponse).toEqual({
      message: "Game not found",
    });
  });
});
