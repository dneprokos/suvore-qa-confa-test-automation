import { test, expect } from "@fixtures/pages-fixture";
import { Config } from "@framework/configuration/config";
import { GameDetailResponse } from "@services/api/types/game-detail";
import { GameTestData } from "@utils/test-data/game-test-data";

test.describe("Game detail navigation", () => {
  // SCN-001 (folds SCN-002, SCN-003)
  test("Game detail - Should open from a catalogue card with all eight fields rendered", async ({
    homePage,
    gameDetailPage,
    page,
    seedGame,
  }) => {
    // Arrange - a game created by the Owner with every field populated and a
    // release instant well away from midnight; seedGame registers its removal.
    const payload = GameTestData.uniqueGamePayload({
      releaseDate: GameTestData.MIDDAY_RELEASE_DATE,
    });
    const seeded = await seedGame(payload);

    // The catalogue is paginated and shared, so the seeded card is reached
    // through the search box, which is part of getting into position.
    await homePage.goto();
    await homePage.searchFor(seeded.name);
    await expect(homePage.cardFor(seeded.name)).toBeVisible();

    // Act
    const detailResponse = await homePage.openCardByName(seeded.name, seeded.id);

    // Assert - the response gate, then the address
    expect(detailResponse.status()).toBe(200);
    const { game } = (await detailResponse.json()) as GameDetailResponse;

    // FR-05.13, FR-05.14 (SCN-001, and SCN-002/SCN-003 which share this traversal)
    await expect(page).toHaveURL(new RegExp(`/game/${seeded.id}$`));
    await expect(gameDetailPage.name).toHaveText(seeded.name);
    await expect(gameDetailPage.heading).toHaveText(seeded.name);

    // FR-05.16 - independent observables, each compared with the values
    // GET /api/games/<id> returned for this game
    await expect.soft(gameDetailPage.genre).toContainText(game.genre);
    await expect
      .soft(gameDetailPage.multiplayer)
      .toContainText(game.hasMultiplayer ? "Yes" : "No");
    await expect.soft(gameDetailPage.rating).toContainText(`(${game.rating}/10)`);
    await expect(gameDetailPage.platformEntries).toHaveCount(game.platforms.length);
    for (const platform of game.platforms) {
      await expect
        .soft(gameDetailPage.platforms)
        .toContainText(platform);
    }
    await expect.soft(gameDetailPage.description).toHaveText(payload.description);
    await expect
      .soft(gameDetailPage.releaseDate)
      .toContainText(GameTestData.MIDDAY_RELEASE_DISPLAY);

    // FR-05.16 / AC-1: Created by shows the e-mail of the Owner who created it
    await expect
      .soft(gameDetailPage.createdByFor(Config.OWNER_EMAIL))
      .toBeVisible();
  });

  // SCN-005
  test("Game detail - Should show the not-found state after a card's game was deleted", async ({
    homePage,
    gameDetailPage,
    page,
    api,
    ownerToken,
    seedGame,
  }) => {
    // Arrange - the card is shown, then its game is deleted while the
    // catalogue stays open (payload per Jira comment 10068)
    const seeded = await seedGame(GameTestData.uniqueGamePayload());
    await homePage.goto();
    await homePage.searchFor(seeded.name);
    await expect(homePage.cardFor(seeded.name)).toBeVisible();

    const deleteResult = await api.games.deleteGame(ownerToken, seeded.id);
    expect(deleteResult.ok).toBe(true); // a broken precondition must fail loudly

    // Act
    const detailResponse = await homePage.openCardByName(seeded.name, seeded.id);

    // Assert - FR-05.17, AC-2
    expect(detailResponse.status()).toBe(404); // Act gate
    await expect(page).toHaveURL(new RegExp(`/game/${seeded.id}$`));
    // Presence half of the presence/absence pairing: hard
    await expect(gameDetailPage.notFoundHeading).toHaveText("Game Not Found");
    await expect
      .soft(gameDetailPage.notFoundMessage)
      .toHaveText("The game you're looking for doesn't exist.");
    await expect.soft(gameDetailPage.notFoundBackLink).toHaveAttribute("href", "/");
    await expect.soft(gameDetailPage.name).toHaveCount(0);
    await expect.soft(gameDetailPage.genre).toHaveCount(0);
    await expect.soft(gameDetailPage.releaseDate).toHaveCount(0);
    await expect.soft(gameDetailPage.multiplayer).toHaveCount(0);
    await expect.soft(gameDetailPage.rating).toHaveCount(0);
    await expect.soft(gameDetailPage.platforms).toHaveCount(0);
    await expect.soft(gameDetailPage.description).toHaveCount(0);
    await expect.soft(gameDetailPage.createdByLabel).toHaveCount(0);
  });

  // SCN-006
  test("Game detail - Should open directly for a guest without a sign-in", async ({
    gameDetailPage,
    page,
    seedGame,
  }) => {
    // Arrange - a game with all eight fields populated; no session is seeded
    const payload = GameTestData.uniqueGamePayload({
      releaseDate: GameTestData.MIDDAY_RELEASE_DATE,
    });
    const seeded = await seedGame(payload);

    // Act
    const detailResponse = await gameDetailPage.goto(seeded.id);

    // Assert - FR-05.15, FR-05.16
    expect(detailResponse.status()).toBe(200); // Act gate
    const { game } = (await detailResponse.json()) as GameDetailResponse;
    await expect(page).toHaveURL(new RegExp(`/game/${seeded.id}$`)); // not redirected away
    await expect(gameDetailPage.name).toHaveText(seeded.name);
    await expect.soft(gameDetailPage.genre).toContainText(game.genre);
    await expect
      .soft(gameDetailPage.releaseDate)
      .toContainText(GameTestData.MIDDAY_RELEASE_DISPLAY);
    await expect
      .soft(gameDetailPage.multiplayer)
      .toContainText(game.hasMultiplayer ? "Yes" : "No");
    await expect.soft(gameDetailPage.rating).toContainText(`(${game.rating}/10)`);
    await expect(gameDetailPage.platformEntries).toHaveCount(game.platforms.length);
    for (const platform of game.platforms) {
      await expect
        .soft(gameDetailPage.platforms)
        .toContainText(platform);
    }
    await expect.soft(gameDetailPage.description).toHaveText(payload.description);
    await expect
      .soft(gameDetailPage.createdByFor(Config.OWNER_EMAIL))
      .toBeVisible();
    await expect.soft(gameDetailPage.notFound).toHaveCount(0);
  });

  // SCN-007
  test("Game detail - Should show the not-found state for a malformed game id", async ({
    gameDetailPage,
  }) => {
    // Arrange - no session, no seeded data: the id is the input

    // Act
    const detailResponse = await gameDetailPage.goto(GameTestData.MALFORMED_GAME_ID);

    // Assert - FR-05.17, AC-3
    expect(detailResponse.status()).toBe(404); // Act gate
    // Presence half of the presence/absence pairing: hard
    await expect(gameDetailPage.notFoundHeading).toHaveText("Game Not Found");
    await expect
      .soft(gameDetailPage.notFoundMessage)
      .toHaveText("The game you're looking for doesn't exist.");
    await expect.soft(gameDetailPage.notFoundBackLink).toHaveAttribute("href", "/");
    await expect.soft(gameDetailPage.name).toHaveCount(0);
    await expect.soft(gameDetailPage.genre).toHaveCount(0);
    await expect.soft(gameDetailPage.releaseDate).toHaveCount(0);
    await expect.soft(gameDetailPage.multiplayer).toHaveCount(0);
    await expect.soft(gameDetailPage.rating).toHaveCount(0);
    await expect.soft(gameDetailPage.platforms).toHaveCount(0);
    await expect.soft(gameDetailPage.description).toHaveCount(0);
    await expect.soft(gameDetailPage.createdByLabel).toHaveCount(0);
  });
});
