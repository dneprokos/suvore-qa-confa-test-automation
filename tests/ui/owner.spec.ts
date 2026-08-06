import { test, expect } from "@fixtures/pages-fixture";
import { Endpoints } from "@services/api/endpoints";
import {
  CreateAdminResponse,
  ListAdminsResponse,
} from "@services/api/types/admin";
import { AdminTestData } from "@utils/test-data/admin-test-data";

test.describe("Owner feature", () => {
  test("As an owner, I should be able to add a new admin", async ({
    page,
    ownerPage,
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange
    const newAdminEmail = AdminTestData.uniqueUiEmail();
    createdAdminEmails.push(newAdminEmail);

    await ownerPage.goto();
    await expect(ownerPage.pageTitle).toBeVisible();

    // Act
    await ownerPage.openAddAdminForm();
    await ownerPage.fillNewAdminForm(
      newAdminEmail,
      AdminTestData.DEFAULT_PASSWORD,
    );

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(Endpoints.admin.users) &&
          response.request().method() === "POST",
      ),
      ownerPage.submitNewAdmin(),
    ]);

    // Assert
    expect(createResponse.status()).toBe(201);
    expect((await createResponse.json()) as CreateAdminResponse).toMatchObject({
      message: "Admin user created successfully",
      admin: { email: newAdminEmail, role: "admin" },
    });

    await expect(ownerPage.toast).toContainText(
      "Admin user created successfully",
    );
    await expect(ownerPage.addAdminFormHeading).toBeHidden();

    await expect(ownerPage.rowFor(newAdminEmail)).toBeVisible();
    await expect(ownerPage.cellFor(newAdminEmail, "role")).toHaveText("ADMIN");
    // AC-1 (SCRUM-139). Known app defect: User.lastLogin defaults to Date.now,
    // so the panel renders today's date instead of "Never".
    await expect(ownerPage.cellFor(newAdminEmail, "lastLogin")).toHaveText(
      "Never",
    );

    const adminsResult = await api.admin.listAdmins(ownerToken);
    expect(adminsResult.status).toBe(200);
    expect(
      (adminsResult.body as ListAdminsResponse).admins.map((a) => a.email),
    ).toContain(newAdminEmail);
  });

  test("As an owner, I should be able to view all admins", async ({
    page,
    ownerPage,
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange - guarantee the list is not empty
    const seededAdminEmail = AdminTestData.uniqueUiEmail();
    createdAdminEmails.push(seededAdminEmail);

    const seedResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(seededAdminEmail),
    );
    expect(seedResult.status).toBe(201);

    // Act
    const [listResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(Endpoints.admin.users) &&
          response.request().method() === "GET",
      ),
      ownerPage.goto(),
    ]);
    await expect(ownerPage.rowFor(seededAdminEmail)).toBeVisible();

    const uiEmails = await ownerPage.adminEmails();
    const apiAdmins = ((await listResponse.json()) as ListAdminsResponse).admins;

    // Assert
    expect(listResponse.status()).toBe(200);
    expect(uiEmails).toContain(seededAdminEmail);
    // FR-11.1 - same admins, most recently created first
    expect(uiEmails).toEqual(apiAdmins.map((admin) => admin.email));
    // FR-11.1 - password data is excluded from the listing
    for (const admin of apiAdmins) {
      expect(admin).not.toHaveProperty("password");
    }
  });

  test("As an owner, I should be able to delete an admin", async ({
    page,
    ownerPage,
    api,
    ownerToken,
    createdAdminEmails,
  }) => {
    // Arrange
    const adminEmail = AdminTestData.uniqueUiEmail();
    createdAdminEmails.push(adminEmail);

    const seedResult = await api.admin.createAdmin(
      ownerToken,
      AdminTestData.createAdminPayload(adminEmail),
    );
    expect(seedResult.status).toBe(201);

    await ownerPage.goto();
    await expect(ownerPage.rowFor(adminEmail)).toBeVisible();

    // Act
    ownerPage.acceptNextConfirmDialog();
    const [deleteResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(Endpoints.admin.users) &&
          response.request().method() === "DELETE",
      ),
      ownerPage.deleteButtonFor(adminEmail).click(),
    ]);

    // Assert
    expect(deleteResponse.status()).toBe(200);
    await expect(ownerPage.toast).toContainText(
      "Admin user deleted successfully",
    );
    await expect(ownerPage.rowFor(adminEmail)).toBeHidden();

    const adminsResult = await api.admin.listAdmins(ownerToken);
    expect(adminsResult.status).toBe(200);
    expect(
      (adminsResult.body as ListAdminsResponse).admins.map((a) => a.email),
    ).not.toContain(adminEmail);
  });
});
