import { test, expect } from "@fixtures/api-fixture";
import {
  AdminErrorResponse,
  CreateAdminResponse,
  ListAdminsResponse,
} from "@services/api/types/admin";
import { ResponsePatterns } from "@utils/response-patterns";
import { AdminTestData } from "@utils/test-data/admin-test-data";
import { AuthTestData } from "@utils/test-data/auth-test-data";

/** Flattens the express-validator messages of a 400 body. */
function errorMessages(body: AdminErrorResponse): string[] {
  return [body.message, ...(body.errors ?? []).map((e) => e.msg)].filter(
    (message): message is string => typeof message === "string",
  );
}

// A "non-owner role is rejected with 403" case is not automated here: `.env`
// points ADMIN_EMAIL at the same address as OWNER_EMAIL, so loginAsAdmin()
// returns an owner token. Such a test would pass for the wrong reason.

test.describe("GET /api/admin/users", () => {
  test("List admins - Should return the admin list for an owner", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange - guarantee the list is not empty
    const seededAdminEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(seededAdminEmail);

    const seedResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(seededAdminEmail),
    );
    expect(seedResult.status).toBe(201);

    // Act
    const result = await api.admin.listAdmins(ownerToken);

    // Assert
    await expect(result.response).toBeOK();
    expect(result.status).toBe(200);

    const admins = (result.body as ListAdminsResponse).admins;
    expect(Array.isArray(admins)).toBe(true);
    expect(admins.map((admin) => admin.email)).toContain(seededAdminEmail);

    for (const admin of admins) {
      expect(admin).toMatchObject({
        _id: expect.any(String),
        email: expect.any(String),
        role: expect.any(String),
        createdAt: expect.any(String),
      });
      expect(admin._id).toMatch(ResponsePatterns.OBJECT_ID);
      expect(admin.createdAt).toMatch(ResponsePatterns.ISO_DATE);
    }
  });

  test("List admins - Should exclude password data", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange
    const seededAdminEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(seededAdminEmail);

    const seedResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(seededAdminEmail),
    );
    expect(seedResult.status).toBe(201);

    // Act
    const result = await api.admin.listAdmins(ownerToken);

    // Assert - FR-11.1, password data is excluded from the listing
    expect(result.status).toBe(200);

    const admins = (result.body as ListAdminsResponse).admins;
    expect(admins.length).toBeGreaterThan(0);
    for (const admin of admins) {
      expect(admin).not.toHaveProperty("password");
      expect(admin).not.toHaveProperty("passwordHash");
    }
  });

  test("List admins - Should return the most recently created admin first", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange - two admins created in a known order
    const olderAdminEmail = AdminTestData.uniqueApiEmail();
    const newerAdminEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(olderAdminEmail, newerAdminEmail);

    const olderResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(olderAdminEmail),
    );
    expect(olderResult.status).toBe(201);

    const newerResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(newerAdminEmail),
    );
    expect(newerResult.status).toBe(201);

    // Act
    const result = await api.admin.listAdmins(ownerToken);

    // Assert - FR-11.1, most recently created first
    expect(result.status).toBe(200);

    const emails = (result.body as ListAdminsResponse).admins.map(
      (admin) => admin.email,
    );
    const newerIndex = emails.indexOf(newerAdminEmail);
    const olderIndex = emails.indexOf(olderAdminEmail);

    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  test("List admins - Should reject a request without a bearer token", async ({
    api,
  }) => {
    // Arrange & Act
    const result = await api.admin.adminBuilder().sendListAdmins();

    // Assert
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.body).not.toHaveProperty("admins");
  });

  test("List admins - Should reject a malformed bearer token", async ({
    api,
  }) => {
    // Arrange & Act
    const result = await api.admin
      .adminBuilder()
      .withBearerToken(AuthTestData.MALFORMED_TOKEN)
      .sendListAdmins();

    // Assert
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.body).not.toHaveProperty("admins");
  });
});

test.describe("POST /api/admin/users", () => {
  test("Create admin - Should create an admin with a valid payload", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange - registered before the call so cleanup runs even if it fails
    const newAdminEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(newAdminEmail);

    // Act
    const result = await api.admin
      .adminBuilder()
      .withBearerToken(ownerToken)
      .withEmail(newAdminEmail)
      .withMatchingPassword(AdminTestData.DEFAULT_PASSWORD)
      .sendCreateAdmin();

    // Assert - FR-11.2
    await expect(result.response).toBeOK();
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      message: "Admin user created successfully",
      admin: {
        id: expect.any(String),
        email: newAdminEmail,
        role: "admin",
        createdAt: expect.any(String),
      },
    });

    const created = (result.body as CreateAdminResponse).admin;
    expect(created.id).toMatch(ResponsePatterns.OBJECT_ID);
    expect(created.createdAt).toMatch(ResponsePatterns.ISO_DATE);
    expect(created).not.toHaveProperty("password");
    expect(created).not.toHaveProperty("confirmPassword");

    const listResult = await api.admin.listAdmins(ownerToken);
    expect(listResult.status).toBe(200);
    expect(
      (listResult.body as ListAdminsResponse).admins.map((a) => a.email),
    ).toContain(newAdminEmail);
  });

  test("Create admin - Should reject a malformed e-mail", async ({
    api,
    ownerToken,
  }) => {
    // Arrange & Act
    const result = await api.admin
      .adminBuilder()
      .withBearerToken(ownerToken)
      .withEmail(AuthTestData.MALFORMED_EMAIL)
      .withMatchingPassword(AdminTestData.DEFAULT_PASSWORD)
      .sendCreateAdmin();

    // Assert - FR-11.3. The requirements leave the exact message for this case
    // open, so only the status and the error shape are asserted.
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect((result.body as AdminErrorResponse).errors ?? []).not.toHaveLength(0);
  });

  test("Create admin - Should reject a password shorter than 6 characters", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange - lower boundary, 5 characters
    const newAdminEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(newAdminEmail);

    // Act
    const result = await api.admin
      .adminBuilder()
      .withBearerToken(ownerToken)
      .withEmail(newAdminEmail)
      .withMatchingPassword(AdminTestData.TOO_SHORT_PASSWORD)
      .sendCreateAdmin();

    // Assert - FR-11.3
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  test("Create admin - Should accept a password of exactly 6 characters", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange - the minimum length is inclusive
    const newAdminEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(newAdminEmail);

    // Act
    const result = await api.admin
      .adminBuilder()
      .withBearerToken(ownerToken)
      .withEmail(newAdminEmail)
      .withMatchingPassword(AdminTestData.MIN_LENGTH_PASSWORD)
      .sendCreateAdmin();

    // Assert - FR-11.3
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      admin: { email: newAdminEmail, role: "admin" },
    });
  });

  test("Create admin - Should reject a mismatched password confirmation", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange
    const newAdminEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(newAdminEmail);

    // Act
    const result = await api.admin
      .adminBuilder()
      .withBearerToken(ownerToken)
      .withEmail(newAdminEmail)
      .withPassword(AdminTestData.DEFAULT_PASSWORD)
      .withConfirmPassword(`${AdminTestData.DEFAULT_PASSWORD}x`)
      .sendCreateAdmin();

    // Assert - FR-11.3
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(errorMessages(result.body as AdminErrorResponse)).toContain(
      "Passwords must match",
    );
  });

  test("Create admin - Should reject an e-mail that is already registered", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange
    const duplicateEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(duplicateEmail);

    const seedResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(duplicateEmail),
    );
    expect(seedResult.status).toBe(201);

    // Act
    const result = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(duplicateEmail),
    );

    // Assert - FR-11.4
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(errorMessages(result.body as AdminErrorResponse)).toContain(
      "User with this email already exists",
    );
  });

  test("Create admin - Should reject a request with an empty body", async ({
    api,
    ownerToken,
  }) => {
    // Arrange & Act
    const result = await api.admin
      .adminBuilder()
      .withBearerToken(ownerToken)
      .withRawBody({})
      .sendCreateAdmin();

    // Assert
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.body).not.toHaveProperty("admin");
  });

  test("Create admin - Should reject a request without a bearer token", async ({
    api,
    ownerToken,
  }) => {
    // Arrange
    const newAdminEmail = AdminTestData.uniqueApiEmail();

    // Act
    const result = await api.admin
      .adminBuilder()
      .withEmail(newAdminEmail)
      .withMatchingPassword(AdminTestData.DEFAULT_PASSWORD)
      .sendCreateAdmin();

    // Assert - the account must not exist afterwards
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);

    const listResult = await api.admin.listAdmins(ownerToken);
    expect(listResult.status).toBe(200);
    expect(
      (listResult.body as ListAdminsResponse).admins.map((a) => a.email),
    ).not.toContain(newAdminEmail);
  });
});

// The requirements carry no functional requirement for delete. The status code
// and message asserted below are the behaviour the UI already pins in
// tests/ui/owner.spec.ts - observed behaviour, not a specification.
test.describe("DELETE /api/admin/users/:id", () => {
  test("Delete admin - Should delete an existing admin", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange
    const adminEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(adminEmail);

    const seedResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(adminEmail),
    );
    expect(seedResult.status).toBe(201);
    const adminId = (seedResult.body as CreateAdminResponse).admin.id;

    // Act
    const result = await api.admin.deleteAdmin(ownerToken, adminId);

    // Assert
    await expect(result.response).toBeOK();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      message: "Admin user deleted successfully",
    });

    const listResult = await api.admin.listAdmins(ownerToken);
    expect(listResult.status).toBe(200);
    expect(
      (listResult.body as ListAdminsResponse).admins.map((a) => a.email),
    ).not.toContain(adminEmail);
  });

  test("Delete admin - Should reject an unknown admin id", async ({
    api,
    ownerToken,
  }) => {
    // Arrange & Act
    const result = await api.admin.deleteAdmin(
      ownerToken,
      AdminTestData.UNUSED_OBJECT_ID,
    );

    // Assert
    expect(result.ok).toBe(false);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThan(500);
  });

  test("Delete admin - Should reject a request without a bearer token", async ({
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange
    const adminEmail = AdminTestData.uniqueApiEmail();
    createdAdminEmails.push(adminEmail);

    const seedResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(adminEmail),
    );
    expect(seedResult.status).toBe(201);
    const adminId = (seedResult.body as CreateAdminResponse).admin.id;

    // Act
    const result = await api.admin.adminBuilder().sendDeleteAdmin(adminId);

    // Assert - the admin must survive an unauthenticated delete
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);

    const listResult = await api.admin.listAdmins(ownerToken);
    expect(listResult.status).toBe(200);
    expect(
      (listResult.body as ListAdminsResponse).admins.map((a) => a.email),
    ).toContain(adminEmail);
  });
});
