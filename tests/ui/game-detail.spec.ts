import { test, expect } from "@fixtures/pages-fixture";
import { Config } from "@framework/configuration/config";
import { GameTestData } from "@utils/test-data/game-test-data";

test.describe("Game detail page", () => {
  // SCN-001
  test("As a Guest, I should be able to click a game's card and view its full detail page", async ({
    page,
    homePage,
    gameDetailPage,
    seedGame,
  }) => {
    // Arrange - a game with all eight FR-05.16 fields populated: hasMultiplayer
    // true (GameTestData's default, kept implicit below), a non-null creator
    // (seedGame creates through the owner's own API token, so the recorded
    // creator is Config.OWNER_EMAIL), two platforms entries and a rating of 1
    const payload = GameTestData.uniqueGamePayload({
      rating: 1,
      platforms: [
        GameTestData.DEFAULT_PLATFORM,
        GameTestData.DEFAULT_SECOND_PLATFORM,
      ],
    });
    const game = await seedGame(payload);

    await homePage.goto();
    await homePage.searchFor(game.name);
    await expect(homePage.headingFor(game.name)).toBeVisible();

    // Act - left-click the card on its title text
    const detailResponse = await homePage.openGameDetail(game.name, game.id);

    // Assert - AC-1/FR-05.13/FR-05.14: the browser URL becomes /game/<id>
    // for the clicked card's game, and FR-05.16: all eight fields render
    // with the values the game's data holds. The heading's own text also
    // proves the title matches the name shown on the clicked card, since
    // both read from `game.name`.
    expect(detailResponse.status()).toBe(200); // Act gate
    await expect(page).toHaveURL(new RegExp(`/game/${game.id}$`));
    await expect(gameDetailPage.headingFor(game.name)).toHaveText(game.name);
    await expect.soft(gameDetailPage.genre).toContainText(payload.genre);
    await expect
      .soft(gameDetailPage.released)
      .toContainText(GameTestData.formattedReleaseDate(payload.releaseDate));
    await expect.soft(gameDetailPage.multiplayer).toContainText("Yes");
    await expect
      .soft(gameDetailPage.rating)
      .toContainText(`(${payload.rating}/10)`);
    await expect
      .soft(gameDetailPage.platformEntries)
      .toHaveCount(payload.platforms.length);
    for (const platform of payload.platforms) {
      await expect.soft(gameDetailPage.platforms).toContainText(platform);
    }
    await expect.soft(gameDetailPage.description).toHaveText(payload.description);
    await expect
      .soft(gameDetailPage.createdBy)
      .toContainText(Config.OWNER_EMAIL);
  });

  // SCN-005
  test("As a Guest, I should see the not-found state when I click a card whose game was deleted", async ({
    page,
    homePage,
    gameDetailPage,
    seedGame,
    api,
    ownerToken,
  }) => {
    // Arrange - the game is created for this scenario and shown as a
    // catalogue card before it is removed elsewhere, so its already-loaded
    // card goes stale (AC-2). Deleting it here rather than through
    // `seedGame`'s own cleanup task is the point of the scenario; the
    // fixture's own delete-on-teardown call afterwards is then a harmless
    // no-op against an already-absent record.
    const game = await seedGame(GameTestData.uniqueGamePayload());

    await homePage.goto();
    await homePage.searchFor(game.name);
    await expect(homePage.headingFor(game.name)).toBeVisible();

    const deleteResult = await api.games.deleteGame(ownerToken, game.id);
    expect(deleteResult.status).toBe(200); // a broken precondition must fail loudly

    // Act - left-click the now-stale card
    const detailResponse = await homePage.openGameDetail(game.name, game.id);

    // Assert - AC-2/FR-05.17: the browser URL still becomes /game/<id>, and
    // the not-found state renders. Presence half of the presence/absence
    // pairing below: hard, since the absence assertions pass just as well
    // on a page that rendered nothing at all.
    expect(detailResponse.status()).toBe(404); // Act gate
    await expect(page).toHaveURL(new RegExp(`/game/${game.id}$`));
    await expect(gameDetailPage.notFoundHeading).toHaveText("Game Not Found");
    await expect
      .soft(gameDetailPage.notFoundMessage)
      .toHaveText("The game you're looking for doesn't exist.");
    await expect
      .soft(gameDetailPage.backToGamesLink)
      .toHaveAttribute("href", "/");

    // None of the eight FR-05.16 fields render, Title included. These
    // absence checks are unpaired within this test: proving each locator
    // resolves would mean viewing this exact game's own detail page while
    // it still exists, which would drop its stale card from the DOM and
    // defeat the scenario's own precondition. Their presence against this
    // same page object is proven by SCN-001 above, in this file.
    await expect.soft(gameDetailPage.headingFor(game.name)).toHaveCount(0);
    await expect.soft(gameDetailPage.genre).toHaveCount(0);
    await expect.soft(gameDetailPage.released).toHaveCount(0);
    await expect.soft(gameDetailPage.multiplayer).toHaveCount(0);
    await expect.soft(gameDetailPage.rating).toHaveCount(0);
    await expect.soft(gameDetailPage.platforms).toHaveCount(0);
    await expect.soft(gameDetailPage.description).toHaveCount(0);
    await expect.soft(gameDetailPage.createdBy).toHaveCount(0);
  });

  // SCN-011
  test("As a Guest, I should be able to open a game's detail URL directly with no session", async ({
    page,
    gameDetailPage,
    seedGame,
  }) => {
    // Arrange - a game with all eight FR-05.16 fields populated; no prior
    // sign-in, no bearer token and no catalogue visit in this session. An
    // integer rating is seeded rather than the default 7.5: decimal-rating
    // rendering is an open question (# Coverage Gaps; # Test Basis Research
    // › Unknowns in the design) and this scenario's own Expected: names no
    // rating value, so asserting against a decimal would invent a value on
    // an unresolved question. SCN-001 takes the same approach with rating: 1.
    const payload = GameTestData.uniqueGamePayload({ rating: 5 });
    const game = await seedGame(payload);

    // Act - a typed or bookmarked URL, never a catalogue click
    const detailResponse = await gameDetailPage.gotoAndWaitForGame(game.id);

    // Assert - FR-05.15: reachable and renderable in full as a Guest, with
    // no authentication prompt, no redirect to a login page and no
    // credential requested at any point - the URL never leaves /game/<id>.
    // FR-05.16: all eight fields render with the values the game's data holds.
    expect(detailResponse.status()).toBe(200); // Act gate
    await expect(page).toHaveURL(new RegExp(`/game/${game.id}$`));
    await expect(gameDetailPage.headingFor(game.name)).toHaveText(game.name);
    await expect.soft(gameDetailPage.genre).toContainText(payload.genre);
    await expect
      .soft(gameDetailPage.released)
      .toContainText(GameTestData.formattedReleaseDate(payload.releaseDate));
    await expect
      .soft(gameDetailPage.multiplayer)
      .toContainText(payload.hasMultiplayer ? "Yes" : "No");
    await expect
      .soft(gameDetailPage.rating)
      .toContainText(`(${payload.rating}/10)`);
    for (const platform of payload.platforms) {
      await expect.soft(gameDetailPage.platforms).toContainText(platform);
    }
    await expect.soft(gameDetailPage.description).toHaveText(payload.description);
    await expect
      .soft(gameDetailPage.createdBy)
      .toContainText(Config.OWNER_EMAIL);
  });
});
