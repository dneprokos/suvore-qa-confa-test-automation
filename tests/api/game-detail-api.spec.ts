import { test, expect } from "@fixtures/api-fixture";
import { Config } from "@framework/configuration/config";
import { GameDetailResponse, GameErrorResponse } from "@services/api/types/games";
import { GameTestData } from "@utils/test-data/game-test-data";

test.describe("GET /api/games/{id}", () => {
  // SCN-010
  test("Get game - Should return the full game body with no authentication required", async ({
    api,
    seedGame,
  }) => {
    // Arrange - a game with all eight FR-05.16 fields populated, created
    // through the owner-authenticated seed so its createdBy is knowable
    const payload = GameTestData.uniqueGamePayload();
    const seededGame = await seedGame(payload);

    // Act - no withBearerToken: the route is public (# API Surface: GET
    // /api/games/{id} Auth: none)
    const result = await api.games.gamesBuilder().sendGetGame(seededGame.id);

    // Assert - FR-05.15, FR-05.16: reachable with no auth sent, and every
    // one of the eight fields carries this game's own values
    await expect(result.response).toBeOK();
    expect(result.status).toBe(200);
    const game = (result.body as GameDetailResponse).game;
    expect(game).toMatchObject({
      name: payload.name,
      genre: payload.genre,
      hasMultiplayer: payload.hasMultiplayer,
      rating: payload.rating,
      platforms: payload.platforms,
      description: payload.description,
    });
    // releaseDate is sent as a bare date and stored/returned as its
    // midnight-UTC ISO datetime - confirmed against a live response
    expect(game.releaseDate).toBe(`${payload.releaseDate}T00:00:00.000Z`);
    // Seeded through the owner token, so the owner is the recorded creator
    expect(game.createdBy?.email).toBe(Config.OWNER_EMAIL);
  });

  // SCN-008
  test("Get game - Should return 404 for a well-formed id that matches no game", async ({
    api,
    ownerToken,
    seedGame,
  }) => {
    // Arrange - a game created and then removed, so its id is well-formed
    // but matches no stored game
    const seededGame = await seedGame(GameTestData.uniqueGamePayload());
    const deleteResult = await api.games.deleteGame(ownerToken, seededGame.id);
    expect(deleteResult.status).toBe(200);

    // Act
    const result = await api.games.gamesBuilder().sendGetGame(seededGame.id);

    // Assert - FR-05.17
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ message: "Game not found" } as GameErrorResponse);
  });

  // SCN-009
  test("Get game - Should return 404 for a malformed id", async ({ api }) => {
    // Arrange & Act
    const result = await api.games
      .gamesBuilder()
      .sendGetGame(GameTestData.MALFORMED_GAME_ID);

    // Assert - FR-05.17: the same contract as a well-formed, non-matching id
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ message: "Game not found" } as GameErrorResponse);
  });
});
