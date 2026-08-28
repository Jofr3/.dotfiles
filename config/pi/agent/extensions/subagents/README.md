# Dynamic Subagents

A Pi extension for composing isolated child agents at dispatch time. There are no predefined agent profiles: the parent chooses the model, reasoning, tools, resources, role instructions, and execution settings independently for every task.

## Design

Each task is assembled from these parts:

| Part | Choices |
|---|---|
| `model` | `luna`, `terra`, `sol`, `inherit`, or an exact `provider/model` |
| `thinking` | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` |
| `tools` | Exact allowlist, `[]` for no tools, or `["*"]` for all normal tools |
| `resources` | `lean` or `inherit` |
| `fast` | Request GPT-5.6 priority service or use normal service |
| `instructions` | Optional task-specific role, constraints, output contract, and ownership |
| `cwd` | Optional child process working directory (not a filesystem boundary) |
| `outputLimit` | Maximum result bytes admitted to the parent context |

Only `task`, `model`, and `tools` are required. Defaults are deliberately limited to mechanical settings:

- `concurrency: 6`
- `maxTasks: 12`
- `timeoutSeconds: 900`
- `outputLimit: 6000`
- `totalOutputLimit: 30000`
- `thinking: "medium"`
- `fast: true`
- `resources: "lean"`

The parent agent decides the semantic composition on the fly rather than selecting a named bundle.

## What it does

- Registers a `subagent` tool and `/subagents` command.
- Runs each task in a separate ephemeral Pi process (`--mode json -p --no-session`).
- Runs independent tasks concurrently (default 6, maximum 8 simultaneous / 12 total).
- Does not copy the parent conversation into children.
- Sends only compact handoffs back to the parent model.
- Writes every complete child result to a private `pi-subagents-*` directory under the system temp directory (usually `/tmp`).
- Tracks nested tokens and cost in Pi's session totals.
- Supports sequential `{previous}` handoffs for genuinely dependent work.
- Propagates aborts and timeouts to the child process tree and does not start queued work after cancellation.
- Removes parent session/model `PI_*` metadata from child startup environments.

## Model selection guidance

These are routing hints, not profiles:

- **Luna** — narrow reconnaissance, fact gathering, focused tests, mechanical edits.
- **Terra** — deeper planning, debugging, review, and substantial implementation.
- **Sol** — hardest cross-cutting architecture, subtle final review, or implementation escalation.
- **inherit** — use the parent model when changing models provides no benefit.

Choose the lowest sufficient thinking level independently from the model. A Terra task can use `low`; a Luna task can use `high`; Sol can use `max` when justified.

## Examples

### Compose three different agents in one parallel call

```json
{
  "mode": "parallel",
  "concurrency": 3,
  "tasks": [
    {
      "label": "auth-map",
      "task": "Trace authentication from the HTTP entry point through session creation. Return exact paths and line ranges.",
      "model": "luna",
      "thinking": "low",
      "tools": ["read", "grep", "find", "ls"],
      "instructions": "Act as a read-only codebase scout. Return compressed evidence, not a narrative."
    },
    {
      "label": "security-review",
      "task": "Review authentication for exploitable correctness and security failures.",
      "model": "terra",
      "thinking": "high",
      "tools": ["read", "grep", "find", "ls", "bash"],
      "instructions": "Do not edit. Use bash only for read-only verification. Report severity and exact file/line evidence."
    },
    {
      "label": "architecture",
      "task": "Determine whether the authentication boundary can support multi-tenant identity without a rewrite.",
      "model": "sol",
      "thinking": "max",
      "tools": ["read", "grep", "find", "ls"],
      "fast": false,
      "instructions": "Act as a system architect. Compare viable designs and make one concrete recommendation."
    }
  ]
}
```

### Parallel implementation with disjoint ownership

```json
{
  "tasks": [
    {
      "label": "server",
      "task": "Implement the server-side change. You own only src/server/** and server tests.",
      "model": "terra",
      "thinking": "high",
      "tools": ["read", "write", "edit", "bash", "grep", "find", "ls"],
      "instructions": "Make complete changes and run focused tests. Do not touch client files."
    },
    {
      "label": "client",
      "task": "Implement the client-side change. You own only src/client/** and client tests.",
      "model": "luna",
      "thinking": "medium",
      "tools": ["read", "write", "edit", "bash", "grep", "find", "ls"],
      "instructions": "Keep the change mechanical and scoped. Do not touch server files."
    }
  ]
}
```

### Agent with inherited skills or extensions

```json
{
  "tasks": [
    {
      "label": "web-research",
      "task": "Research the current API behavior and return cited evidence.",
      "model": "luna",
      "thinking": "medium",
      "tools": ["read", "bash"],
      "resources": "inherit",
      "instructions": "Use the appropriate installed web research skill. Separate verified facts from inference."
    }
  ]
}
```

### Sequential compressed handoff

```json
{
  "mode": "sequential",
  "tasks": [
    {
      "label": "recon",
      "task": "Find the relevant implementation and constraints.",
      "model": "luna",
      "thinking": "low",
      "tools": ["read", "grep", "find", "ls"]
    },
    {
      "label": "plan",
      "task": "Create a concrete implementation plan using this compressed handoff:\n\n{previous}",
      "model": "terra",
      "thinking": "high",
      "tools": ["read", "grep", "find", "ls"],
      "instructions": "Do not edit. Tie every step to exact files and tests."
    }
  ]
}
```

## Fast mode

Pi removed the old non-working `*-fast` Codex model variants. This extension does not invent model IDs. Instead, `fast: true` injects OpenAI's `service_tier: "priority"` into GPT-5.6 Luna/Terra/Sol child requests.

Priority mode is best-effort:

- It applies only to `openai` or `openai-codex` GPT-5.6 Luna/Terra/Sol.
- If the provider rejects priority before any tool executes, the child retries once without it.
- Priority service can consume quota or be priced differently. Set `fast: false` whenever normal latency is acceptable.

## Resource modes

- `lean` — disables other extensions, skills, prompts, and themes in the child. It loads only this extension's child hook. Use this by default for minimum startup and prompt overhead.
- `inherit` — loads normal user/project resources. Choose this only when the child needs an installed skill or extension. The task's strict `tools` list still controls callable tools.

## Configuration

Global aliases and mechanical defaults are read fresh on every invocation from `subagents.json` in Pi's resolved agent directory (normally `~/.pi/agent/subagents.json`).

A trusted project can override them with the nearest `.pi/subagents.json`. Project lookup follows the real filesystem path of the working directory, so a symlinked cwd cannot select a config from an unrelated lexical ancestor.

```json
{
  "aliases": {
    "luna": "openai-codex/gpt-5.6-luna",
    "terra": "openai-codex/gpt-5.6-terra",
    "sol": "openai-codex/gpt-5.6-sol"
  },
  "defaults": {
    "concurrency": 6,
    "maxTasks": 12,
    "timeoutSeconds": 900,
    "outputLimit": 6000,
    "totalOutputLimit": 30000,
    "thinking": "medium",
    "fast": true,
    "resources": "lean"
  }
}
```

Configuration intentionally does not contain role or capability profiles.

## Safety

Context isolation is not a sandbox. Child processes share the filesystem and user permissions. A task `cwd` may be absolute or escape the parent directory with `..`; it selects a process working directory rather than enforcing containment.

The launcher strips the parent's `PI_SESSION_ID`, `PI_SESSION_FILE`, `PI_PROVIDER`, `PI_MODEL`, and `PI_REASONING_LEVEL` before child startup. Pi then supplies metadata for the child's own ephemeral runtime where appropriate. With `resources: "inherit"`, user/project extensions still run with normal user permissions and should be trusted accordingly.

Parallel read-only work is safe. Parallel writers must have disjoint ownership because separate processes cannot share Pi's in-process file mutation queue. Prefer one writer plus parallel scouts/reviewers when ownership cannot be partitioned cleanly.

## Tests

The test suite uses Node's built-in test runner, a fake JSONL child process, and one model-free Pi RPC smoke test. It covers config trust/aliases, registration, parallel and sequential dispatch, nested usage, artifacts, strict output limits, partial failures, environment isolation, priority child mode, and cancellation.

```bash
npm --prefix ~/.pi/agent/extensions/subagents test
```

Set `PI_TEST_BIN=/path/to/pi` if `pi` is not on `PATH`.
