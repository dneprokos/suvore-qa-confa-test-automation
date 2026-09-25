# Use case: package a workflow as a plugin and install it from a marketplace

Example: the `slack-bug-triage` workflow (one skill, five agents, scripts) that lives in this
repository's `.claude/` — shipped as a plugin so any other project can install it with two commands.

---

## Part 1 — Create the plugin

### 1. Lay out the plugin folder

A plugin is a folder with a manifest plus the same `skills/`, `agents/`, `commands/`, `hooks/` folders a
project's `.claude/` would have:

```
plugins/slack-bug-triage/
├── .claude-plugin/
│   └── plugin.json              ← the manifest (required)
├── skills/slack-bug-triage/
│   ├── SKILL.md                 ← the orchestrator
│   ├── references/
│   └── assets/
├── agents/
│   ├── triage-slack-collector.md
│   ├── triage-bug-drafter.md
│   ├── triage-duplicate-scout.md
│   ├── triage-bug-filer.md
│   └── triage-slack-responder.md
├── scripts/                     ← anything the skill/agents run
└── README.md
```

### 2. Write the manifest — `.claude-plugin/plugin.json`

```json
{
  "name": "slack-bug-triage",
  "description": "Triages a Slack bug-reports channel into Jira ...",
  "version": "1.0.0",
  "author": { "name": "Kostiantyn Teltov", "url": "https://github.com/dneprokos" },
  "keywords": ["slack", "jira", "bug-triage", "qa", "workflow"]
}
```

`name` becomes the namespace: the skill is invoked as `/slack-bug-triage:slack-bug-triage`, an agent is
addressed as `slack-bug-triage:triage-bug-drafter`.

### 3. Make the copied files install-location independent

What changes when a file moves from `.claude/` into a plugin:

| In the project | In the plugin |
|---|---|
| `node scripts/slack-triage-journal.mjs` | `node ${CLAUDE_PLUGIN_ROOT}/scripts/slack-triage-journal.mjs` |
| agent `triage-bug-drafter` | agent `slack-bug-triage:triage-bug-drafter` |
| script writes next to itself | script writes to `CLAUDE_PROJECT_DIR` (fallback: working dir) |

`${CLAUDE_PLUGIN_ROOT}` is replaced with the install directory when the markdown loads. Output (the
ledger) must go into the *host* project, not into the plugin cache.

### 4. Publish a marketplace — `.claude-plugin/marketplace.json` at the repo root

A marketplace is a catalogue; one repository can list many plugins.

```json
{
  "name": "suvore-qa-confa",
  "owner": { "name": "Kostiantyn Teltov", "url": "https://github.com/dneprokos" },
  "plugins": [
    {
      "name": "slack-bug-triage",
      "description": "Turn a Slack bug-reports channel into Jira tickets ...",
      "source": "./plugins/slack-bug-triage",
      "category": "workflow"
    }
  ]
}
```

`source` is relative to the repository root.

### 5. Test locally before pushing

```bash
claude --plugin-dir ./plugins/slack-bug-triage
```

Then in the session: `/slack-bug-triage:slack-bug-triage --dry-run`.

### 6. Push to GitHub

Commit `plugins/` and `.claude-plugin/marketplace.json` and push. The GitHub repo *is* the marketplace;
nothing else to host.

---

## Part 2 — Install it in another project

### 1. Add the marketplace (once per machine)

```
/plugin marketplace add dneprokos/suvore-qa-confa-test-automation
```

(A local clone works too: `/plugin marketplace add ./path/to/repo`.)

### 2. Install the plugin

```
/plugin install slack-bug-triage@suvore-qa-confa
```

Format is `<plugin-name>@<marketplace-name>`. Or run `/plugin` and pick it from the menu. Restart
Claude Code if prompted.

### 3. Give it what the plugin does not ship

The plugin brings the workflow, not the secrets or the servers:

- **`.mcp.json`** in the host project, declaring servers named exactly `slack` and `atlassian` — the agents'
  tool allowlists name `mcp__slack__*` / `mcp__atlassian__*` literally (snippet in the plugin's README).
- **OS environment variables**: `SLACK_MCP_XOXB_TOKEN`, `SLACK_TRIAGE_CHANNEL_ID`,
  `SLACK_TRIAGE_SELF_USER_ID`.
- Invite the Slack bot to the channel once by hand.

### 4. Run it

```
/slack-bug-triage:slack-bug-triage --dry-run
/slack-bug-triage:slack-bug-triage
```

### 5. Maintain

```
/plugin marketplace update suvore-qa-confa     # pull new versions
/plugin                                        # enable / disable / uninstall
```

---

## Takeaway

- A plugin is a `.claude/` folder plus a `plugin.json` — nothing new to learn.
- A marketplace is a JSON file in a Git repo — `marketplace add` + `install` and the whole team has it.
- Rewrite paths with `${CLAUDE_PLUGIN_ROOT}` and agent names with the plugin namespace, or the copy breaks
  on the first run.
- Keep secrets and MCP servers out of the plugin; the host provides them.
