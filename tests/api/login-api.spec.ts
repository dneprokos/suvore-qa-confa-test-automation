import { test, expect } from "@fixtures/api-fixture";
import { Config } from "@framework/configuration/config";
import { LoginResponse } from "@services/api/types/auth";
import { ResponsePatterns } from "@utils/response-patterns";
import { AuthTestData } from "@utils/test-data/auth-test-data";

test.describe("POST /api/auth/login", () => {
  // SCN-001
  test("Login as owner - Should be able to login with valid credentials", async ({
    api,
  }) => {
    // Arrange
    const userEmail = Config.OWNER_EMAIL;

    // Act
    const result = await api.auth
      .loginBuilder()
      .withEmail(userEmail)
      .withPassword(Config.OWNER_PASSWORD)
      .sendLogin();

    // Assert
    await expect(result.response).toBeOK();
    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.body).toMatchObject({
      message: "Login successful",
      token: expect.any(String),
      user: {
        id: expect.any(String),
        email: userEmail,
        role: "owner",
        createdAt: expect.any(String),
      },
    });

    const body = result.body as LoginResponse;
    expect(body.token).toMatch(ResponsePatterns.JWT);
    expect(body.user.id).toMatch(ResponsePatterns.OBJECT_ID);
    expect(body.user.createdAt).toMatch(ResponsePatterns.ISO_DATE);
  });

  // SCN-002
  test("Login as owner - Should reject invalid credentials", async ({ api }) => {
    // Arrange
    const userEmail = Config.OWNER_EMAIL;

    // Act
    const result = await api.auth
      .loginBuilder()
      .withEmail(userEmail)
      .withPassword(AuthTestData.INVALID_PASSWORD)
      .sendLogin();

    // Assert
    expect(result.ok).toBe(false);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.body).toMatchObject({
      message: "Invalid email or password",
    });
    expect(result.body).not.toHaveProperty("token");
  });

  // SCN-003
  test("Login - Should reject a request without a password", async ({
    api,
  }) => {
    // Arrange & Act
    const result = await api.auth
      .loginBuilder()
      .withEmail(Config.OWNER_EMAIL)
      .sendLogin();

    // Assert
    expect(result.ok).toBe(false);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThan(500);
    expect(result.body).not.toHaveProperty("token");
  });
});
