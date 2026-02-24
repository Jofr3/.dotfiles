---
name: safeguard
description: Manage tool call safety rules. Use when the user wants to add, remove, or list safeguard rules that block, confirm, or allow tool calls based on regex matching. Rules are stored in ~/.pi/agent/safeguard.json.
---

# Safeguard

A policy engine that intercepts tool calls and evaluates them against configurable rules. Rules can **allow**, **block**, or **confirm** (prompt the user) based on regex matching against tool inputs.

## Commands

- `/safeguard` — List all current rules
- `/safeguard-add` — Add a new rule interactively
- `/safeguard-remove` — Remove a rule interactively

## Config file

Rules live in `~/.pi/agent/safeguard.json`. The config is hot-reloaded — edits take effect on the next tool call.

### Structure

```json
{
  "defaultAction": "allow",
  "rules": [
    {
      "tool": "bash",
      "match": "rm\\s+(-rf|--recursive)",
      "action": "confirm",
      "label": "Recursive delete"
    }
  ]
}
```

### Rule fields

| Field | Required | Description |
|-------|----------|-------------|
| `tool` | yes | Tool name to match (`bash`, `write`, `edit`, `read`, `grep`, `find`, `ls`, `mysql_query`, or `*` for all) |
| `match` | yes | Regex pattern (case-insensitive) tested against the tool input field |
| `field` | no | Which input field to test. Defaults: `bash`→`command`, `read/write/edit`→`path`, `grep/find`→`pattern`. Use `*` to match against the full JSON input |
| `action` | yes | `allow` (skip remaining rules), `block` (deny), or `confirm` (prompt user) |
| `label` | yes | Human-readable description shown in block/confirm messages |

### Default action

`defaultAction` applies when no rule matches. Set to `"allow"`, `"block"`, or `"confirm"`.

## Managing rules directly

To add a rule, edit `~/.pi/agent/safeguard.json` and append to the `rules` array:

```json
{
  "tool": "bash",
  "match": "\\bdocker\\s+rm\\b",
  "action": "confirm",
  "label": "Docker container removal"
}
```

To remove a rule, delete its entry from the array.

## Rule evaluation order

Rules are evaluated top-to-bottom. The first matching rule wins. If an `allow` rule matches, the tool call proceeds immediately without checking further rules. Place more specific rules before general ones.
