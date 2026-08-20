# Repository Guidelines

## Project Structure & Module Organization

This repository contains Playwright + TypeScript automation for the Retro Video Games Portal plus an agent workflow for turning requirements into tests.

- `tests/api/` contains API specs; `tests/ui/` contains UI specs.
- `pages/` holds page objects with locators and user actions.
- `fixtures/` defines the Playwright fixture chain: API fixtures first, UI page fixtures on top.
- `services/api/` contains facades, controllers, request builders, endpoints, and response helpers.
- `framework/configuration/` owns environment loading and Joi validation.
- `utils/` stores reusable test data and response patterns.
- `requirements/` and `test-design/` store ticket-derived analysis artifacts.
- `.claude/agents/`, `.claude/skills/`, and `docs/conference/` define the agent workflow. See `CLAUDE.md` for the full contract.

## Build, Test, and Development Commands

Run these from the repository root:

- `npm install` installs dependencies.
- `npx playwright install` installs browsers for UI tests.
- `npm test` runs the full Playwright suite.
- `npm run test:api` runs only API tests.
- `npm run test:ui` runs only UI tests in Desktop Chrome.
- `npm run test:headed` runs tests with a visible browser.
- `npm run test:debug` opens the Playwright inspector.
- `npm run report` opens the last HTML report.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run test:scripts` runs Node tests in `scripts/__tests__/`.

The app under test must already be running at `BASE_URL`; `playwright.config.ts` does not start a web server.

## Coding Style & Naming Conventions

Use TypeScript with strict checking and CommonJS modules. Prefer aliases from `tsconfig.json`, such as `@pages/*`, `@fixtures/*`, `@services/*`, and `@utils/*`. Keep page objects assertion-free: locators and actions belong in `pages/`, while `expect` belongs in specs. Do not read `process.env` outside `framework/configuration/config.ts`; add new settings to the Joi schema, `Config`, and `.env.example`.

Use `*.spec.ts` for Playwright specs and kebab-case filenames for tests, pages, and service modules.

## Testing Guidelines

Import `test` and `expect` from project fixtures, not directly from `@playwright/test`. API specs use request builders for the action under test and controllers for setup or cleanup. UI specs use page objects and web-first assertions. Avoid `waitForTimeout`; rely on Playwright auto-waiting.

Each test should create isolated data through `utils/` helpers and register cleanup through fixtures.

## Commit & Pull Request Guidelines

Recent history uses concise Conventional Commit style, for example `feat(agents): ...`, `feat(qa-workflow): ...`, and `chore: ...`. Keep commits scoped and imperative.

Pull requests should include a short summary, linked ticket or issue when available, commands run, and relevant Playwright reports or UI screenshots. Call out required `.env` changes without exposing secrets.

## Security & Configuration Tips

Keep `.env` local and never commit credentials. Use `.env.example` for documented keys only. Generated reports and test results should remain uncommitted unless explicitly requested.
