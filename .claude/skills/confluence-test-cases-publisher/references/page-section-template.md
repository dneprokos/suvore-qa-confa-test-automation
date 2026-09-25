# Page section template

Read at step 5 of the skill. The shape is fixed so the section can be found and
replaced on the next run — the heading text is the anchor. The shape is the same
in both modes: in sub-page mode the section is the whole body of a new page, and
it keeps its `<h2>` so a later run finds it the same way.

## Section layout

```html
<h2>Test cases: {STORY_TITLE}</h2>
<p><strong>Ticket:</strong> {TICKET_KEY} · <strong>Updated:</strong> {YYYY-MM-DD} · <strong>Cases:</strong> {N}</p>
<table>
  <tbody>
    <tr><th>ID</th><th>Type</th><th>Given</th><th>When</th><th>Then</th><th>AC</th></tr>
    <tr><td>TC-01</td><td>{TYPE}</td><td>{GIVEN}</td><td>{WHEN}</td><td>{THEN}</td><td>{AC}</td></tr>
  </tbody>
</table>
<p><strong>Coverage:</strong> {COVERAGE}</p>
<h3>Open questions</h3>
<ol>
  <li>{QUESTION} — <em>affects {TC-IDS}</em></li>
</ol>
```

## Rules

- **Heading** — exactly `Test cases: ` + the story title. No ticket key, no
  date in it: it is the anchor step 6 searches for, so it must not change between runs.
- **Ticket** — omit the whole `Ticket: … ·` part when no key was given.
- **Updated** — today's date, ISO form.
- **Rows** — one `<tr>` per test case, in source order, cell text copied as is.
- **Type** — plain text, one of `Positive`, `Negative`, `Boundary`.
- **Code spans** — a value in backticks (`` `Passw0rd!` ``) becomes
  `<code>Passw0rd!</code>`. Nothing else is reformatted.
- **Escaping** — `&`, `<`, `>` in cell text become `&amp;`, `&lt;`, `&gt;`.
- **Coverage** — the source line without its `Coverage:` prefix, `✓` kept.
- **Open questions** — drop the `Q1.` numbering, the `<ol>` numbers them.
  Keep the order: `Q1` is item 1, so a `see Q1` in a `Then` cell still points at
  the right item. When the source says `OPEN QUESTIONS: none`, write
  `<p>None.</p>` instead of the `<ol>`. Never drop the `<h3>`.

## Example

Source row:

```
| TC-03 | Boundary | Owner is logged in | Adds an admin with a 7-character password `Passw0r` and matching confirmation | Admin is not created; an error is shown (see Q1) | AC-3, AC-5 |
```

Rendered:

```html
<tr><td>TC-03</td><td>Boundary</td><td>Owner is logged in</td><td>Adds an admin with a 7-character password <code>Passw0r</code> and matching confirmation</td><td>Admin is not created; an error is shown (see Q1)</td><td>AC-3, AC-5</td></tr>
```
