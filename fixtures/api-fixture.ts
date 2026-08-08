import { test as base } from "@playwright/test";
import { ApiFacade } from "@services/api/api-facade";
import { AdminUser, ListAdminsResponse } from "@services/api/types/admin";
import { LoginResponse } from "@services/api/types/auth";

/**
 * One resource to remove after the test.
 *
 * `label` is what a cleanup warning names, so it has to identify the record to
 * a human reading a CI log - "game 66f1a2 (Contra)", not "task 3".
 */
export type CleanupTask = {
  label: string;
  run: () => Promise<void>;
};

type ApiFixtures = {
  api: ApiFacade;
  ownerToken: string;
  createdAdminEmails: string[];
  cleanupTasks: CleanupTask[];
  uncleanableResources: string[];
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

  /**
   * Removal steps for any resource `createdAdminEmails` does not cover.
   *
   * Register the task the instant the resource exists - for a UI create flow,
   * before the submit. Fixture teardown runs whether the test passed or failed,
   * so a task registered at creation time survives a failing assertion, while
   * one registered after the assertions does not run at all.
   *
   * Tasks are drained in reverse: a resource created last may depend on one
   * created earlier, so it has to go first. Each runs in its own try/catch and
   * a failure is only ever a warning - a cleanup problem must not change the
   * test result, which has to keep reflecting the behaviour under test.
   */
  cleanupTasks: async ({}, use) => {
    const tasks: CleanupTask[] = [];

    await use(tasks);

    for (const task of [...tasks].reverse()) {
      try {
        await task.run();
      } catch (error) {
        console.warn(
          `[cleanup] Removing ${task.label} threw: ${String(error)}. It may be left behind.`,
        );
      }
    }
  },

  /**
   * Labels of records this test created that the application offers no way to
   * remove. Pushing one turns a silent leak into a line in the run output.
   *
   * This is the honest last resort, not a shortcut around `cleanupTasks`: a
   * resource with a delete route belongs there. A label here means the route
   * does not exist, and the same fact belongs under `Known Limitations` in the
   * implementation report.
   */
  uncleanableResources: async ({}, use) => {
    const labels: string[] = [];

    await use(labels);

    for (const label of labels) {
      console.warn(`[cleanup] NOT CLEANED UP: ${label} - no delete endpoint`);
    }
  },
});

export { expect } from "@playwright/test";
