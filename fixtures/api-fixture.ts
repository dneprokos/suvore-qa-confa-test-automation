import { test as base } from "@playwright/test";
import { ApiFacade } from "@services/api/api-facade";
import { AdminUser, ListAdminsResponse } from "@services/api/types/admin";
import { LoginResponse } from "@services/api/types/auth";
import { CreateGameRequest } from "@services/api/types/games";

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

/** A game seeded as a precondition, with its removal already registered. */
export type SeededGame = {
  id: string;
  name: string;
  /** The create call's status, for a scenario whose `Expected:` names it. */
  status: number;
};

/**
 * Creates one game over the API and returns it ready to act on.
 *
 * Throws when the seed produced no usable record, so a caller never branches
 * on whether it worked.
 */
export type SeedGame = (payload: CreateGameRequest) => Promise<SeededGame>;

type ApiFixtures = {
  api: ApiFacade;
  ownerToken: string;
  createdAdminEmails: string[];
  cleanupTasks: CleanupTask[];
  uncleanableResources: string[];
  seedGame: SeedGame;
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

  /**
   * Seeds one game over the API and registers its removal before returning,
   * so a failing assertion later in the test cannot jump over the
   * registration.
   *
   * It throws rather than handing back a result to inspect, for the same
   * reason `ownerToken` does: a seed that produced no usable record is a
   * broken precondition, not a finding about the behaviour under test. That
   * is what keeps the `// Arrange` block free of an `id === undefined` branch
   * and a `as string` cast at every call site - five of them across this
   * suite, each a copy of the same twenty lines.
   *
   * The two failure modes are different facts and are reported differently.
   * A create that did not succeed made nothing: there is no record to remove
   * and none to report as unremovable, so it only throws. A create that
   * succeeded but whose id could not be read back *did* make a record this
   * run cannot remove, so its label goes to `uncleanableResources` first and
   * the throw follows. Conflating the two is how a rejected 400 came to be
   * printed as an unremovable leak.
   */
  seedGame: async (
    { api, ownerToken, cleanupTasks, uncleanableResources },
    use,
  ) => {
    await use(async (payload: CreateGameRequest) => {
      const { result, id } = await api.games.createGameAndGetId(
        ownerToken,
        payload,
      );

      if (!result.ok) {
        throw new Error(
          `Seeding game "${payload.name}" failed with status ${result.status}: ${JSON.stringify(result.body)}`,
        );
      }

      if (id === undefined) {
        uncleanableResources.push(
          `game "${payload.name}" - created (status ${result.status}) but its id could not be read back from the response, see services/api/controllers/games-api.ts extractGameId`,
        );
        throw new Error(
          `Seeded game "${payload.name}" but could not read its id back from the ${result.status} response: ${JSON.stringify(result.body)}`,
        );
      }

      cleanupTasks.push({
        label: `game ${id} (${payload.name})`,
        run: async () => {
          await api.games.deleteGame(ownerToken, id);
        },
      });

      return { id, name: payload.name, status: result.status };
    });
  },
});

export { expect } from "@playwright/test";
