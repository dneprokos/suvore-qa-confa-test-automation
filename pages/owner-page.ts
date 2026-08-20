import { Locator, Page } from "@playwright/test";

/** Column order of the "Admin Users Management" table. */
const AdminColumn = {
  email: 0,
  role: 1,
  created: 2,
  lastLogin: 3,
  actions: 4,
} as const;

/**
 * Owner Panel (/owner).
 *
 * The page ships no `data-testid` attributes, so every locator here is
 * role-based. Reported as an app gap - see docs/automation/references/browser-exploration.md.
 */
export class OwnerPage {
  readonly pageTitle: Locator;
  readonly addAdminButton: Locator;
  readonly addAdminFormHeading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly createAdminButton: Locator;
  readonly cancelButton: Locator;
  readonly adminsTable: Locator;
  readonly adminRows: Locator;
  readonly toast: Locator;

  constructor(private readonly page: Page) {
    this.page = page;
    this.pageTitle = page.getByRole("heading", { name: "OWNER PANEL" });
    this.addAdminButton = page.getByRole("button", {
      name: "Add Admin",
      exact: true,
    });
    this.addAdminFormHeading = page.getByRole("heading", {
      name: "Add New Admin",
    });
    this.emailInput = page.getByRole("textbox", {
      name: "Email Address *",
      exact: true,
    });
    this.passwordInput = page.getByRole("textbox", {
      name: "Password *",
      exact: true,
    });
    this.confirmPasswordInput = page.getByRole("textbox", {
      name: "Confirm Password *",
      exact: true,
    });
    this.createAdminButton = page.getByRole("button", { name: "Create Admin" });
    this.cancelButton = page.getByRole("button", { name: "Cancel" });
    this.adminsTable = page.getByRole("table");
    // The second rowgroup is the table body; the first one holds the headers.
    this.adminRows = this.adminsTable
      .getByRole("rowgroup")
      .nth(1)
      .getByRole("row");
    this.toast = page.getByRole("status");
  }

  async goto() {
    await this.page.goto("/owner", { waitUntil: "domcontentloaded" });
  }

  async openAddAdminForm() {
    await this.addAdminButton.click();
    await this.addAdminFormHeading.waitFor();
  }

  async fillNewAdminForm(
    email: string,
    password: string,
    confirmPassword: string = password,
  ) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(confirmPassword);
  }

  async submitNewAdmin() {
    await this.createAdminButton.click();
  }

  rowFor(email: string): Locator {
    return this.adminRows.filter({ hasText: email });
  }

  cellFor(email: string, column: keyof typeof AdminColumn): Locator {
    return this.rowFor(email).getByRole("cell").nth(AdminColumn[column]);
  }

  deleteButtonFor(email: string): Locator {
    return this.rowFor(email).getByRole("button", { name: "Delete Admin" });
  }

  /** E-mails of the listed admins, top row first. */
  async adminEmails(): Promise<string[]> {
    const rows = await this.adminRows.all();

    return Promise.all(
      rows.map(async (row) =>
        (await row.getByRole("cell").nth(AdminColumn.email).innerText()).trim(),
      ),
    );
  }

  /**
   * Deletion is guarded by a native `window.confirm`. Playwright dismisses
   * unhandled dialogs, which would swallow the DELETE call, so the handler
   * has to be registered before the click.
   */
  acceptNextConfirmDialog() {
    this.page.once("dialog", (dialog) => void dialog.accept());
  }
}
