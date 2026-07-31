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

```bash
claude mcp add -s user drizzle-db -- node "$HOME/.claude/mcp/drizzle-db/server.mjs"
claude mcp add -s user mem        -- node "$HOME/.claude/mcp/mem/server.mjs"
claude mcp list   # health-check
```

That registration lives in `~/.claude.json`, which is **not** part of this repo — on a new
machine the command above has to be run again. Everything else here is tracked.

## What earns a server

Both servers import their skill's own modules rather than shelling out, so the safety rules
have one copy: `drizzle-db` shares `classifyStatement` with its CLI, `mem` shares
`src/format.mjs` with `bin/mem`. Neither pair can drift on what needs `--force`, or on how a
memory reads back.

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
