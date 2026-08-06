import { test as base } from "@playwright/test";
import { ApiFacade } from "@services/api/api-facade";
import { AdminUser, ListAdminsResponse } from "@services/api/types/admin";
import { LoginResponse } from "@services/api/types/auth";

type ApiFixtures = {
  api: ApiFacade;
  ownerToken: string;
  createdAdminEmails: string[];
};

export const test = base.extend<ApiFixtures>({
  api: async ({ request }, use) => {
    await use(new ApiFacade(request));
  },

  /** Owner JWT obtained over the API, no UI login involved. */
  ownerToken: async ({ api }, use) => {
    const result = await api.auth.loginAsOwner();
    if (!result.ok) {
      throw new Error(
        `Owner API login failed with status ${result.status}: ${JSON.stringify(result.body)}`,
      );
    }

    await use((result.body as LoginResponse).token);
  },

  /**
   * Admin e-mails registered here are removed over the API after the test.
   *
   * Teardown never fails the test - a cleanup problem is reported as a warning,
   * so the test result keeps reflecting the behaviour under test. The admin list
   * is fetched once and every registered e-mail is resolved against it, and each
   * e-mail is isolated, so one failure cannot leak the ones that follow.
   */
  createdAdminEmails: async ({ api, ownerToken }, use) => {
    const emails: string[] = [];

    await use(emails);

    if (emails.length === 0) {
      return;
    }

    let admins: AdminUser[] = [];
    try {
      const listResult = await api.admin.listAdmins(ownerToken);
      if (!listResult.ok) {
        console.warn(
          `[cleanup] Listing admins failed with status ${listResult.status}: ${JSON.stringify(listResult.body)}. ${emails.length} admin(s) may be left behind: ${emails.join(", ")}`,
        );
        return;
      }
      admins = (listResult.body as ListAdminsResponse)?.admins ?? [];
    } catch (error) {
      console.warn(
        `[cleanup] Listing admins threw: ${String(error)}. ${emails.length} admin(s) may be left behind: ${emails.join(", ")}`,
      );
      return;
    }

    for (const email of emails) {
      const ids = admins
        .filter((admin) => admin.email === email)
        .map((admin) => admin._id);

      for (const id of ids) {
        try {
          const deleteResult = await api.admin.deleteAdmin(ownerToken, id);
          if (!deleteResult.ok) {
            console.warn(
              `[cleanup] Deleting admin ${email} (${id}) failed with status ${deleteResult.status}: ${JSON.stringify(deleteResult.body)}`,
            );
          }
        } catch (error) {
          console.warn(
            `[cleanup] Deleting admin ${email} (${id}) threw: ${String(error)}`,
          );
        }
      }
    }
  },
});

export { expect } from "@playwright/test";
