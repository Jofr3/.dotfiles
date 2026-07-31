# MCP servers

Local stdio MCP servers that expose `skills/` tooling as typed tools instead of shell commands.
A skill can only ever tell Claude to *run* something — usually via Bash — so its operations
arrive as command strings. A server gives the same operations real argument schemas: no shell
escaping, and per-tool permission entries instead of one coarse `Bash(node …)` rule.

```
lib/mcp-stdio.mjs      shared JSON-RPC 2.0 / MCP transport, no dependencies
drizzle-db/server.mjs  6 tools
mem/server.mjs         7 tools
```

## Registration

The two servers register by different routes, and the difference is not a style choice — it
is whether a plugin exists to do it.

**`mem` registers itself.** It is an enabled plugin (`mem@skills-dir`, auto-discovered from
`skills/`), and a plugin may declare MCP servers in a `.mcp.json` at its root. So
`skills/mem/.mcp.json` names this server:

```json
{ "mem": { "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/../../mcp/mem/server.mjs"] } }
```

`${CLAUDE_PLUGIN_ROOT}` is `~/.claude/skills/mem`, so the hop lands back here. That file is
tracked, which means a clone of this repo gets the server with no setup at all.

**`drizzle-db` cannot do that.** It is a plain skill directory with no
`.claude-plugin/plugin.json`, so nothing loads it as a plugin and there is no manifest to
carry a `.mcp.json`. It has to be registered by hand, per machine:

```bash
claude mcp add -s user drizzle-db -- node "$HOME/.claude/mcp/drizzle-db/server.mjs"
claude mcp list   # health-check
```

That registration lives in `~/.claude.json`, which sits *beside* the `~/.claude` symlink
rather than inside it, and is **not** part of this repo. Everything else here is tracked.

## Why the servers live here and not inside the plugin

`skills/mem/` is a plugin: it owns the hooks (`hooks/hooks.json`, which only a plugin loader
reads — `${CLAUDE_PLUGIN_ROOT}` expands nowhere else) and the four `/mem:*` skills. `mcp/` owns
transports and servers. Keeping the split means both servers share
`lib/mcp-stdio.mjs` instead of one of them vendoring a copy, and it keeps the plugin's manifest
about loading rather than about protocol.

MCP is not a loader. It carries tools to a running session; it has no concept of a hook, and
this repo already measured that its prompts and resources never reach the model's context (see
below). So a server can never replace the plugin — it is the typed surface the plugin points
at.

## What earns a server

Both servers import their skill's own modules rather than shelling out, so the safety rules
have one copy: `drizzle-db` shares `classifyStatement` with its CLI, `mem` shares
`src/format.mjs` with `bin/mem`. Neither pair can drift on what needs `--force`, or on how a
memory reads back.

The one thing `format.mjs` deliberately does *not* share verbatim is the sentence telling the
reader how to undo something — `CLI_HINTS` vs `TOOL_HINTS`. A tool result that read "restore
with `mem forget 7 --restore`" would send the model to Bash for an operation it was just handed
a typed tool for, which defeats the point of having the tool.

### mem was reverted once — what changed

An earlier attempt wrapped the whole CLI as **22 tools** and was reverted: it put every
maintenance command in context permanently to wrap something that was never broken. The
rewrite is narrower and two things moved:

1. **Only the driven commands.** search, remember, list, show, forget, pin, review — the
   surface the four skills already describe. The maintenance tier (prune, maintain,
   consolidate, pairs, undo, stats, export/import, reembed, tune, doctor) is not exposed. It
   runs from hooks and by hand, and every one of those loses memories in bulk. `bin/mem` is
   still the full surface.

2. **Tool schemas are deferred now.** The host lists deferred tools by name and loads a schema
   only when `ToolSearch` asks for it, so the permanent-context cost the revert was about is
   largely gone.

What it buys that the CLI cannot: the embedding extractor loads once and stays warm. Measured
on this machine, same store, same queries —

| | 1st search | 2nd | 3rd |
| --- | --- | --- | --- |
| `bin/mem search` (fresh process each time) | 403ms | 383ms | 391ms |
| MCP server (one process) | 314ms | **19ms** | **19ms** |

The CLI pays the model load on every invocation by design; that is the cost of costing nothing
when idle. A long-lived server pays it once.

The general rule: wrap a skill only when the tool boundary buys something the CLI cannot —
argument typing on a dangerous call, shared safety code, or a warm process. Wrapping for
uniformity buys nothing. Expose the commands, not the internals.

## Tools only — why prompts and resources were removed

An MCP server can also publish prompts and resources, and this one did briefly: the skill
markdown served as `skill://drizzle-db/…`. It was removed, because measuring it showed it
could not do the job it was added for.

Against a real session with `MCP_DEBUG_LOG`, Claude Code negotiates `prompts/list` and
`resources/list` at startup and loads *neither* into the model's context; only `tools/list`.
Resources are reachable on demand via `ListMcpResourcesTool`, prompts are user-invoked. So the
prompt duplicated a skill that already auto-triggers, and the resources duplicated files the
model can `Read` at paths SKILL.md already lists.

| Surface | Reaches the model | Invoked by |
| --- | --- | --- |
| tools | always in context | model |
| skills | description matched against the request | model |
| prompts | on invocation | user (slash command) |
| resources | on read | model, via an explicit tool call |

What fires on the model's own initiative, from the user's phrasing alone, is a skill's
frontmatter `description`. Delete the skills and nothing auto-triggers.

## The stdout rule

stdout carries protocol frames and nothing else. `lib/mcp-stdio.mjs` reassigns
`process.stdout.write` to stderr at startup and keeps a private handle for framing, so a stray
`console.log` cannot desynchronise the stream.

That does **not** protect against a child process inheriting fd 1 — it writes to the real
descriptor, below JavaScript. This bit the drizzle server: the skill's lazy driver install
spawned `npm` with `stdio: ['ignore', 'inherit', 'inherit']`, and npm's "up to date in 9s"
landed mid-stream. `deps.mjs` now passes fd `2` as the child's stdout. Anything spawned from a
server must pipe its stdout or point it at stderr.

## Debugging a handshake

`MCP_DEBUG_LOG=<path>` records every method a client asks for, one per line:

```bash
MCP_DEBUG_LOG=/tmp/mcp.log claude -p "reply ok" --max-turns 1
sort /tmp/mcp.log | uniq -c
```

Note that `claude mcp list` is only a health check — it stops at `tools/list`, so it will not
show you prompt or resource negotiation. Use a real session.
