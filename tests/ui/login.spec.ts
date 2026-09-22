import { test, expect } from "@fixtures/pages-fixture";
import { Config } from "@framework/configuration/config";
import { AuthTestData } from "@utils/test-data/auth-test-data";

test.describe("Login feature", () => {
  // SCN-004
  test("Login as owner - Should be able to login with valid credentials", async ({
    page,
    loginPage,
    homePage,
  }) => {
    // Arrange
    const userEmail = Config.OWNER_EMAIL;
    await loginPage.goto();

    // Act
    await loginPage.login(userEmail, Config.OWNER_PASSWORD);

    // Assert
    await expect(page).toHaveURL("/");
    await expect(homePage.navigation).toContainText(userEmail);
    await expect(homePage.logoutButton).toBeVisible();
    await expect(homePage.navigation).toContainText("Owner");
    await expect(homePage.navigation).toContainText("Admin");
  });

  // SCN-005
  test("Login as owner - Should display error message with invalid credentials", async ({
    page,
    loginPage,
  }) => {
    // Arrange
    const userEmail = Config.OWNER_EMAIL;
    await loginPage.goto();

    // Act
    await loginPage.login(userEmail, AuthTestData.INVALID_PASSWORD);

    // Assert
    await expect(page).toHaveURL("/login");
    await expect(loginPage.errorMessage).toContainText(
      "Invalid email or password",
    );
  });
});
