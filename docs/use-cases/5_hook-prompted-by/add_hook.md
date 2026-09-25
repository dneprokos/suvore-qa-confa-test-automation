# Hook — run `prompted-by.mjs` when Claude stops

Entry for the `hooks` object in a Claude Code settings file:

```json
"Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "timeout": 5,
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/prompted-by.mjs\""
          }
        ]
      }
    ]
```
