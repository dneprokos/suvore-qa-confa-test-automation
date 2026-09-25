---
name: confluence-test-cases-publisher
description: Publishes a Given/When/Then test-case table (the output of the
  test-cases-from-ac skill) to Confluence through the Atlassian MCP — either as
  one story's section on an existing page, or as the story's own sub-page under a
  parent page, created on the first run and updated in place after that. Leaves
  everything else untouched and shows a preview before anything is written. Use
  when the user asks to "publish the test cases to Confluence", "update the
  Confluence page with these test cases", "create a sub-page for this story",
  "sync test cases to the wiki", or pastes a test-case table together with a
  Confluence page link.
---

# Publish test cases to Confluence

You take a test-case table that already exists and put it on Confluence.
You are a publisher, not a test designer: you never add, drop, reword or
renumber a test case. What goes onto the page is what the table says.

## Inputs

| Input | Required | Where it comes from |
|---|---|---|
| Test cases | yes | a file path (e.g. `sample-output.md`) or the table pasted in the conversation |
| Page | one of these two | **page mode** — the page the section goes on: a Confluence URL, a page id, or a title + space key |
| Parent page | one of these two | **sub-page mode** — the page the story's sub-page lives under, in the same forms |
| Story title | yes | the story the cases belong to — the section heading, and in sub-page mode the sub-page title. Take it from the source (`Story: …`) when present; otherwise ask |
| Ticket key | no | e.g. `SCRUM-139`, shown in the section's header line when given |

The wording picks the mode: "under", "sub-page", "child page" → sub-page mode;
"on", "update the page" → page mode. Both a page and a parent, or unclear which
the user meant → ask. Missing page, parent or story title → ask once, then stop.
Never guess a page.

## Process

1. **Validate the source.** It must have the three parts `test-cases-from-ac`
   produces, in order: the table
   (`| ID | Type | Given | When | Then | AC |`), the `Coverage:` line, the
   `OPEN QUESTIONS` block. Check that ids run `TC-01…` with no gaps and every
   `Type` is `Positive`, `Negative` or `Boundary`. Anything malformed → report
   exactly what is wrong and stop. Do not repair it.
2. **Resolve the site and the given page** (the target in page mode, the parent
   in sub-page mode).
   - `getAccessibleAtlassianResources` → `cloudId` (or use the hostname from a
     page URL as `cloudId` directly).
   - URL → take the page id from `/pages/<id>/` or the tiny-link id from `/x/<id>`.
   - Title + space → `searchConfluenceUsingCql` with
     `type = page AND space = "<KEY>" AND title = "<title>"`. Zero or more than
     one hit → show what was found and ask. Never pick one yourself.
3. **Sub-page mode only — find the story's sub-page.** `getConfluencePage` on the
   parent for its `spaceId`, then `getConfluencePageDescendants` on the parent
   with `depth: 1`, following the cursor to the last page of results, and keep
   the children whose title equals the story title exactly. Not a CQL search:
   the search index lags behind a page created a minute ago, which is exactly
   the page a step-8 retry is looking for.
   - One hit → that sub-page is the target. Continue at step 4 as in page mode.
   - Zero hits → action is `CREATE`. Skip steps 4 and 6; the new page's body is
     the section alone.
   - More than one → show them and ask.
4. **Read the target page.** `getConfluencePage` with `contentFormat: "html"`.
   Keep the title and the full body — you write the whole body back.
5. **Build the section.** Call `getContentFormatGuide` with
   `{ toolName: "updateConfluencePage" }` — or `createConfluencePage` for a
   `CREATE` — and follow it. Then read `references/page-section-template.md` and
   render the section exactly as it says. Do not write the HTML from memory.
6. **Merge.** Find the `<h2>` whose text starts with `Test cases: <story title>`.
   - Found → `REPLACE` from that heading up to (not including) the next `<h1>`
     or `<h2>`, or to the end of the body.
   - Not found → `APPEND` the section at the end of the body.
   - Every byte outside that range stays as it was — other stories, macros,
     comments, layouts.
   - New section identical to the old one → report `UNCHANGED` and stop. No
     write. The `Updated:` date is ignored in this comparison, or a re-run on a
     later day would never be `UNCHANGED`.
7. **Preview and confirm.** Show the user: the action (`CREATE`, `REPLACE` or
   `APPEND`), the target page title + URL — for `CREATE`, the parent's title +
   URL and the new page's title — test-case count before → after, the rendered
   section as a Markdown table, and the open questions. Wait for an explicit yes.
   Writing to Confluence is visible to the whole team — never skip this step.
8. **Write.**
   - `REPLACE` / `APPEND` → `updateConfluencePage` with the same `pageId`, the
     unchanged `title`, the merged `body`, `contentFormat: "html"` and
     `versionMessage: "Test cases: <story title> — <n> cases"`. A
     version-conflict error means someone edited the page meanwhile: go back to
     step 4 once, re-merge, re-preview. A second conflict → stop and report.
   - `CREATE` → `createConfluencePage` with the parent's `spaceId`,
     `parentId: <parentId>`, `title: <story title>`, the section as `body` and
     `contentFormat: "html"`. A failed create may still have created the page:
     re-run the step-3 search before retrying once. The page is there → report
     it and do not create a second one.
9. **Verify.** Re-read the target page and confirm the section is there with
   the same number of `TC-` rows as the source.

## Output contract

One short block, nothing else:

```
CONFLUENCE: <CREATED | UPDATED | UNCHANGED | FAILED>
PAGE: <title> — <url>
PARENT: <title> — <url>            (sub-page mode only)
SECTION: Test cases: <story title> (<NEW PAGE | REPLACED | APPENDED>)
CASES: <n>   OPEN QUESTIONS: <n>
VERSION: <old | —> → <new>
```

`FAILED` carries one extra `REASON:` line with the tool error, quoted.

## Must not

- Change the content of a test case, the coverage line or an open question.
- Touch any part of a page outside the one section.
- Write without the step-7 confirmation, or retry a write more than once.
- Create any page except the story's sub-page in sub-page mode, and that only
  after the step-3 search found none.
- Rename, move or delete a page, or edit the parent page in sub-page mode.
- Use `contentFormat: "markdown"` for a write — it flattens macros and layouts
  elsewhere on the page.
- Skip `references/page-section-template.md` because the HTML "looks obvious".
