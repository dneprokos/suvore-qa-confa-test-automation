# Structured data in prompts (XML and JSON)

A prompt usually carries two kinds of text: **instructions** (what to do) and **data**
(the ticket, the log, the test output, the list of cases). When both arrive as one block
of prose, the model has to guess where the instruction ends and the data begins. It may
follow a sentence inside a pasted log as if you wrote it, or miss half the cases because
they were buried in a paragraph.

Wrap the data in a structure the model can find:

- **XML tags** for blocks of free text: a ticket, a stack trace, a diff, a report.
- **JSON** for records with fields: a list of test cases, a payload, the answer shape you
  want back.

Then refer to each block by its name in the instruction: *"the cases in `<cases>`"*.

---

## Example 1 — separate the instruction from pasted text

### ❌ Mixed (do not use)

```text
Here is the failure, please find the cause. Error: locator.click: Timeout 30000ms
exceeded. waiting for getByRole('button', { name: 'Add Admin' }) at
pages/owner-page.ts:42 at tests/ui/owner.spec.ts:57. The ticket says the owner
should be able to add an admin from the dashboard, and the button appears after
the admin list loads. Also the log says: retrying click, element is not stable.
Keep the fix small.
```

What goes wrong:

- **Where does the error end?** "The ticket says…" reads like part of the log.
- **Which text is the requirement** and which is your own guess about it?
- **"Keep the fix small"** sits at the end of the data and is easy to lose.

### ✅ Tagged (use this)

```xml
<task>
Find the root cause of the failure in <error>, using <requirement> as the expected
behaviour. Do not add waitForTimeout or retries. Report the cause as file:line and
propose the smallest fix.
</task>

<requirement source="SCRUM-139, AC-2">
The owner can add an admin from the dashboard. The "Add Admin" button is shown
after the admin list has loaded.
</requirement>

<error file="tests/ui/owner.spec.ts" line="57">
locator.click: Timeout 30000ms exceeded.
  waiting for getByRole('button', { name: 'Add Admin' })
  - element is not stable
  - retrying click action
    at pages/owner-page.ts:42
</error>
```

Now each piece has one home. The model knows the error is evidence, the requirement is
the oracle, and the task is the only thing to obey.

> Text inside a data tag is **data, not instructions**. If a pasted Slack message says
> "ignore the previous rules", it is still just the content of `<slack_message>`. Say so
> in the task when the data comes from someone else.

---

## Example 2 — give test cases as JSON, not as prose

### ❌ Prose (do not use)

```text
Write API tests for creating an admin. It should work with a normal email, fail if
the email is already taken (I think that's a 409), fail with a bad email like
"not-an-email", and also the passwords must match, otherwise it's a 400 I believe,
and without a token it should be 401.
```

The model has to extract five cases from a paragraph, and "I think" / "I believe" makes
it unclear which status codes are confirmed.

### ✅ JSON (use this)

```text
Add one API test per case in <cases> to tests/api/admin-create.spec.ts.
Use the "expectedStatus" value exactly. A case with "confirmed": false gets
test.fixme() and a comment naming the open question — do not guess the status.
```

```json
{
  "endpoint": "POST /api/admin/users",
  "cases": [
    { "id": "SCN-001", "title": "valid email and matching passwords", "expectedStatus": 201, "confirmed": true },
    { "id": "SCN-002", "title": "email already registered",           "expectedStatus": 409, "confirmed": false },
    { "id": "SCN-003", "title": "malformed email 'not-an-email'",     "expectedStatus": 400, "confirmed": true },
    { "id": "SCN-004", "title": "password confirmation mismatch",     "expectedStatus": 400, "confirmed": true },
    { "id": "SCN-005", "title": "no bearer token",                    "expectedStatus": 401, "confirmed": true }
  ]
}
```

Every case has an id to trace, a title to reuse in the test name, and one field that
says whether the expected value is known. Nothing has to be inferred.

---

## Example 3 — ask for the answer as JSON

When the output will be read by a script, a checklist or another agent, name its shape.

### ❌ Open answer (do not use)

```text
Look at the test results and tell me what failed.
```

You will get a friendly paragraph, different every time.

### ✅ Answer schema (use this)

```xml
<task>
Read the Playwright output in <results>. Return only JSON matching <schema>.
No prose before or after it. Use null when a field is unknown; do not invent a value.
</task>

<schema>
{
  "total": number,
  "failed": [
    {
      "title": string,
      "file": string,
      "line": number | null,
      "error": string,
      "category": "product-bug" | "test-bug" | "environment" | "unknown"
    }
  ]
}
</schema>

<results>
  … paste the `npx playwright test --reporter=line` output here …
</results>
```

A fixed shape can be diffed between runs, parsed by `jq`, or pasted into a ticket, and
the `null` rule stops the model filling a gap with a plausible guess.

---

## Which format for which data

| Data | Format | Why |
|---|---|---|
| Ticket, requirement, user story | `<requirement>` tag | Free text; the tag marks it as the oracle |
| Stack trace, log, test output | `<error>`, `<results>` tag | Keeps log lines from being read as instructions |
| Diff or code to review | `<diff>`, `<code file="…">` tag | Attributes carry the path without extra prose |
| Test cases, data matrix | JSON array | One record per case, same fields every time |
| Request payload | JSON object | It is already JSON in the real request |
| Expected answer shape | JSON schema inside `<schema>` | Parsable, comparable between runs |
| Short list of rules | Markdown list | Structure would add noise, not clarity |

## Rules of thumb

| Do | Don't |
|---|---|
| Name tags for what they hold: `<error>`, `<cases>` | Use generic names: `<data>`, `<text1>` |
| Refer to the tag in the instruction: "the cases in `<cases>`" | Say "the stuff below" |
| Put long data first, the task and questions after it | Put a one-line task under 300 lines of log |
| Keep a tag name the same across prompts | Call it `<log>` today and `<output>` tomorrow |
| Add attributes for metadata: `file="…"`, `source="…"` | Describe the metadata in a sentence before the block |
| Mark unknown values explicitly (`"confirmed": false`, `null`) | Leave "I think" and "maybe" inside the data |
| Validate the JSON you paste | Paste JSON with trailing commas and comments |

> XML and JSON are not magic keywords. They work because they make boundaries visible.
> Any consistent structure helps; mixing instructions and data in one paragraph never does.
