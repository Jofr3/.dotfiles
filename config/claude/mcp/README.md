# MCP servers

Local stdio MCP servers that expose `skills/` tooling as typed tools instead of shell commands.
A skill can only ever tell Claude to *run* something — usually via Bash — so its operations
arrive as command strings. A server gives the same operations real argument schemas: no shell
escaping, and per-tool permission entries instead of one coarse `Bash(node …)` rule.

```
lib/mcp-stdio.mjs      shared JSON-RPC 2.0 / MCP transport, no dependencies
drizzle-db/server.mjs  6 tools
```

## Registration

`drizzle-db` is a plain skill directory with no `.claude-plugin/plugin.json`, so nothing loads
it as a plugin and there is no manifest to carry a `.mcp.json`. It has to be registered by
hand, per machine:

```bash
claude mcp add -s user drizzle-db -- node "$HOME/.claude/mcp/drizzle-db/server.mjs"
claude mcp list   # health-check
```

That registration lives in `~/.claude.json`, which sits *beside* the `~/.claude` symlink
rather than inside it, and is **not** part of this repo. Everything else here is tracked.

A plugin skips that step: a plugin may declare MCP servers in a `.mcp.json` at its root, with
`${CLAUDE_PLUGIN_ROOT}` pointing back at a server here. That is the only reason to prefer the
plugin route — MCP is not a loader. It carries tools to a running session; it has no concept
of a hook, and this repo already measured that its prompts and resources never reach the
model's context (see below).

**A third-party HTTP server can borrow the same route.** `claude mcp add -s user` is the
obvious way to add a remote server, but it writes to that same untracked `~/.claude.json`, so
the registration dies with the machine. A plugin directory holding nothing but a manifest and
a `.mcp.json` gets the same server tracked instead — `skills/mobbin/` is two files and no code:

```json
{ "mobbin": { "type": "http", "url": "https://api.mobbin.com/mcp" } }
```

It loads as `plugin:mobbin:mobbin`. Note that discovery keys off the `.claude-plugin/plugin.json`,
not off the directory containing a skill, so a plugin under `skills/` may legitimately ship no
skill at all. OAuth is still per machine: the tracked file names the server, `/mcp` authenticates
it, and the token lands in `.credentials.json`, which is gitignored.

## Why servers live here and not inside a skill

`mcp/` owns transports and servers so that every server shares `lib/mcp-stdio.mjs` instead of
one of them vendoring a copy, and so a plugin's manifest stays about loading rather than about
protocol.

## What earns a server

The server imports its skill's own modules rather than shelling out, so the safety rules have
one copy: `drizzle-db` shares `classifyStatement` with its CLI. The pair cannot drift on what
needs `--force`.

One thing such a shared formatter should deliberately *not* share verbatim is the sentence
telling the reader how to undo something. A tool result that read "restore with `foo --restore`"
would send the model to Bash for an operation it was just handed a typed tool for, which
defeats the point of having the tool. Keep separate CLI and tool hint strings.

Expose the driven commands, not the maintenance tier — anything that destroys data in bulk
belongs behind the CLI, where it is run by hand. Tool schemas are deferred now anyway: the
host lists deferred tools by name and loads a schema only when `ToolSearch` asks for it, so
the permanent-context cost of a wide tool surface is largely gone; the argument against
wrapping everything is now about blast radius, not context.

What a server buys that a CLI cannot is a warm process — anything with an expensive one-time
load (a model, a connection pool) pays it once instead of per invocation. The CLI pays that
cost every time by design; that is what makes it cost nothing when idle.

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
