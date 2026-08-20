import { test, expect } from "@fixtures/pages-fixture";
import { ListGamesResponse } from "@services/api/types/games";
import { GameTestData } from "@utils/test-data/game-test-data";

test.describe("Search games", () => {
  test("Search games - Should be able to find existing games", async ({
    homePage,
    seedGame,
  }) => {
    // Arrange - the game searched for is seeded over the API rather than read
    // off the catalogue's first page: the catalogue is shared and not
    // test-isolated, so a title borrowed from it can be deleted by a spec
    // running in parallel while this one is mid-search. seedGame registers
    // the removal before it returns and throws on a seed that produced no
    // usable record, so a broken precondition fails loudly here.
    const seededGame = await seedGame(GameTestData.uniqueGamePayload());
    const existingGameName = seededGame.name;

    await homePage.goto();

    // Act - filling the search box is the whole action; the listing
    // re-requests GET /api/games with the term and ships no submit control
    const searchResponse = await homePage.searchFor(existingGameName);

    // Assert - the searched-for game is among the rendered results, and the
    // rendered cards are exactly the games that search returned. The search
    // response is the independent oracle: the catalogue varies by
    // environment, so no fixed result set can be named here.
    expect(searchResponse.status()).toBe(200); // Act gate
    const matchedNames = (
      (await searchResponse.json()) as ListGamesResponse
    ).games.map((game) => game.name);
    expect(matchedNames).toContain(existingGameName);

    // Web-first, so it retries until the grid has re-rendered from that
    // response: waitForResponse resolves when the response arrives, not when
    // React has rendered it, and gameNamesOnCurrentPage() below snapshots
    // the cards.
    await expect(homePage.gameNameHeadings).toHaveCount(matchedNames.length);
    const renderedNames = await homePage.gameNamesOnCurrentPage();
    expect([...renderedNames].sort()).toEqual([...matchedNames].sort());

    await expect(homePage.headingFor(existingGameName)).toHaveText(
      existingGameName,
    );
    await expect(homePage.noResults).toBeHidden();
  });

  test("Search games - Should display no games found when searching for non-existent games", async ({
    homePage,
  }) => {
    // Arrange
    await homePage.goto();

    // Act
    const searchResponse = await homePage.searchFor(
      GameTestData.NON_EXISTENT_GAME_NAME,
    );

    // Assert - the empty state is rendered and no game card survives the
    // search. The search response carrying zero games is the independent
    // oracle for the term genuinely matching nothing, so a UI that rendered
    // the empty state for the wrong reason still fails.
    expect(searchResponse.status()).toBe(200); // Act gate
    expect(
      ((await searchResponse.json()) as ListGamesResponse).games,
    ).toHaveLength(0);

    // Presence half of the presence/absence pairing: hard, since the absence
    // assertion below passes just as well on a page that rendered nothing.
    await expect(homePage.noResultsHeading).toHaveText("No Games Found");
    // Independent observables of the same block, so a changed message still
    // reports the heading result alongside it.
    await expect
      .soft(homePage.noResultsMessage)
      .toHaveText("Try adjusting your search or filters to find more games.");
    await expect.soft(homePage.gameNameHeadings).toHaveCount(0);
  });
});
