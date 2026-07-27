# Dynamic Sub-Agents for Pi

`sub-agents` is a global Pi extension for creating and supervising an evolving pool of task-specific child agents.

Each child:

- is defined dynamically by the main agent—there are no predefined personas or agent-profile files;
- runs in-process in its own isolated `AgentSession` with a separate transcript, model state, tools, retries, compaction state, and abort control;
- can stay idle with its context retained and accept later assignments;
- receives only explicitly selected, extension-owned tools;
- belongs to one parent-session generation; no old runtime is published as active in a replacement generation, while unproven cleanup fails closed and may leave owned work live.

The main agent remains responsible for decomposition, orchestration, reviewing child results, and the final answer.

> **Release status:** The shared-workspace implementation and its output, security, and cancellation audits are complete. First-release documentation and validation are still in progress. Git worktree mode is not implemented.

## Requirements and loading

Pi auto-discovers this directory when it is installed as:

```text
~/.pi/agent/extensions/sub-agents/
├── index.ts
└── ...supporting files
```

The extension uses the Pi distribution's installed packages and needs no local build or dependency installation. Run `/reload` after changing its source.

Runtime requirements:

- at least one child-compatible model must be available through Pi's model registry;
- automatic routing works best when `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol` are available;
- guarded child `grep` uses an already installed `rg` executable and never downloads one;
- child `bash` requires an interactive approval-capable UI for the exact spawn batch.

## Quick start

Create independent read-only children:

```json
{
  "agents": [
    {
      "name": "trace-request-flow",
      "role": "Trace the request path and identify the owning modules",
      "objective": "Map the relevant files and functions. Report evidence and unresolved questions.",
      "complexity": "simple",
      "tools": ["read", "grep", "find", "ls"],
      "workspace": { "mode": "shared" },
      "notifyOn": ["idle", "blocked", "failed"]
    },
    {
      "name": "test-gap-review",
      "role": "Review existing tests for missing failure cases",
      "objective": "Identify the highest-value missing tests without changing files.",
      "complexity": "moderate",
      "tools": ["read", "grep", "find", "ls"],
      "workspace": { "mode": "shared" },
      "notifyOn": ["idle", "blocked", "failed"]
    }
  ]
}
```

Call this object with `sub_agents_spawn`. The tool returns an opaque ID for every successfully initialized child without waiting for its assignment to finish. Keep those exact IDs for later control calls.

Typical flow:

1. `sub_agents_spawn` starts useful independent work.
2. `sub_agents_status` inspects current state without blocking.
3. `sub_agents_send` redirects a running child or reuses an idle child.
4. `sub_agents_wait` establishes an explicit completion barrier and collects newly accrued usage.
5. `sub_agents_release` gives up retained workspace ownership when the child should remain reusable.
6. `sub_agents_remove` starts bounded cleanup for children that are no longer needed.

## Dynamic child specification

Only `name`, `role`, and `objective` are required.

| Field | Behavior |
|---|---|
| `name` | Task-specific display label. It need not be unique; opaque IDs are authoritative. |
| `role` | Role invented for this assignment, not a profile lookup key. |
| `objective` | Initial assignment. |
| `instructions` | Optional additional task instructions. |
| `context` | Optional bounded task context. Never put credentials or secrets here. |
| `modelPolicy` | `auto` by default; also supports `inherit` and `explicit`. |
| `model` | Exact `{ provider, id }`; valid only with `modelPolicy: "explicit"`. |
| `complexity` | `moderate` by default; `simple`, `moderate`, or `complex`. |
| `thinkingLevel` | Requested Pi thinking level; defaults to `medium` for a new child and is clamped to model support. |
| `tools` | Exact child built-in allowlist. Omit for `read`, `grep`, `find`, and `ls`; an empty array gives no built-ins. The child-only `report_to_parent` tool is still present. |
| `workspace` | Defaults to shared parent workspace with bash disabled. See [Workspace safety](#workspace-safety). |
| `resultInstructions` | Optional requested result format or emphasis. |
| `tags` | Optional organizational labels. |
| `notifyOn` | Optional subset of `idle`, `blocked`, and `failed`. Omission means no parent wake-up notification for that child. |

The schema rejects unknown properties. Important public bounds are:

| Input | Limit |
|---|---:|
| name / role | 120 / 1,000 characters |
| objective / instructions | 12,000 characters each |
| context / result instructions | 24,000 / 4,000 characters |
| provider / model ID | 128 / 256 characters |
| tags | 20 items, 80 characters each |
| tools / notification states | 7 / 3 unique items |
| workspace cwd or scope path | 4,096 characters |
| exact write-scope paths | 100 unique items |

One `sub_agents_spawn` call accepts at most 64 specifications. This is an input/result transport bound, **not** a live-pool or concurrency limit. Repeated calls may continue adding children, and valid entries in one admitted call initialize concurrently without a worker semaphore. An uncapped pool can still exhaust memory, pressure the event loop, or hit provider connection/rate limits; observe the pool and remove idle children whose context is no longer useful.

### Child lifecycle

```text
creating -> running -> idle -> running ...
                    \-> blocked -> resumed running
                    \-> failed
any live state -> stopping -> removed
```

- `idle`: the last assignment completed and the child remains reusable.
- `blocked`: orchestration is needed, commonly because of a workspace lease conflict. A settled blocked child can resume the same assignment through `sub_agents_send` after the blocker is resolved.
- `failed`: the assignment/runtime failed; the child does not accept more work.
- `removed`: the child is no longer controllable as live work. Normally only bounded history remains; if settlement/disposal was unproven, the record may retain cleanup uncertainty and leases while owned work may still be live.

## Model routing

### Automatic routing

`modelPolicy: "auto"` is deterministic and does not make another model call to classify work.

| Complexity | Preferred model | Fallback order |
|---|---|---|
| `simple` | `gpt-5.6-luna` | Luna -> Terra -> Sol -> inherited parent model |
| `moderate` | `gpt-5.6-terra` | Terra -> Sol -> Luna -> inherited parent model |
| `complex` | `gpt-5.6-sol` | Sol -> Terra -> inherited parent model |

Complex work is never automatically downgraded to Luna.

For each canonical tier ID, the router prefers the parent model's provider when that exact model is available there. Otherwise, it accepts only one unique available provider. Ambiguous exact-ID matches fail closed and require an explicit provider/model choice.

Use:

- `simple` for narrow, latency-sensitive discovery or mechanical checks;
- `moderate` for ordinary analysis and bounded implementation;
- `complex` for ambiguous, architectural, integration, security-sensitive, or high-stakes work;
- `inherit` when the child must use the current parent provider/model;
- `explicit` only when an exact registry provider and canonical model ID are required.

### Reconfiguration

An idle child's model and thinking level change immediately while its transcript remains intact:

```json
{
  "changes": [
    {
      "id": "<exact child ID>",
      "modelPolicy": "auto",
      "complexity": "complex",
      "thinkingLevel": "high"
    }
  ]
}
```

For a running child, `sub_agents_reconfigure` defaults to `runningBehavior: "queue"`; the latest accepted replacement applies only after that exact assignment reaches a reusable boundary. `runningBehavior: "abort-and-switch"` intentionally aborts the current assignment, records it as aborted without inventing a result, and then applies the new route.

## Control tools

All target IDs are exact, opaque, and scoped to the current parent-session generation. Control arrays accept at most 100 targets per call unless noted otherwise.

### `sub_agents_spawn`

Creates 1–64 dynamic children. Each valid entry is independent, so one initialization failure does not cancel valid siblings. The result returns after prompt preflight, not assignment completion.

A spawn call that includes child `bash` is review-sensitive: before any child starts, Pi shows the bounded names/objectives of the bash-capable children and asks the operator to approve the exact batch. Approval grants those children shell capability until removal, including later messages.

### `sub_agents_status`

Returns compact current state for selected IDs or, when `ids` is omitted, a bounded live-first all-agent view.

Important options:

- `includeRemoved` defaults to `false`; `true` includes bounded current and restored history;
- `detail` defaults to `"compact"`; `"timeline"` includes recent bounded manager milestones;
- `eventLimit` defaults to 20 and is capped at 100;
- `drainUsage: false` is the default; `true` atomically attaches only newly accrued child usage to this tool result.

An omitted-ID all-agent view returns at most 100 records. This does not limit the pool.

### `sub_agents_send`

Accepts one message per unique exact ID.

- idle child -> starts a new assignment;
- running child -> queues `followUp` by default or an explicit `steer`;
- settled blocked child -> resumes the same assignment after the blocker/ownership issue is resolved.

Use `steer` only when the running assignment should be redirected before its next model turn. Message bodies are omitted from the tool's result, but Pi records tool-call arguments before execution; never include secrets.

### `sub_agents_reconfigure`

Changes model policy, complexity route, exact model, and optional thinking level for idle/running children. Every change must include `modelPolicy`; `explicit` requires `model`, while `auto` and `inherit` forbid it. Idle changes apply immediately. Running changes queue by default or use explicit `abort-and-switch` semantics as described above.

### `sub_agents_wait`

Waits on a fixed call-start set of selected IDs or the current bounded live set.

Defaults:

- `condition: "all"`;
- matching states: `idle`, `blocked`, `failed`, or `removed`;
- timeout: 120 seconds (maximum 300).

The tool streams compact state changes, returns bounded final outputs, drains only previously unreported usage for valid selected children, and does not remove them. Later spawns do not join an existing wait.

### `sub_agents_release`

Releases all retained shared-workspace ownership for selected idle or runtime-settled blocked children. It keeps each child runtime and transcript alive and does **not** resume blocked work.

After resolving ownership:

1. inspect the owner with `sub_agents_status`;
2. call `sub_agents_release` on an owner whose retained ownership is no longer needed;
3. call `sub_agents_send` on the blocked child to resume its assignment.

Do not use release as a substitute for removal.

### `sub_agents_remove`

Stops and attempts to dispose selected children or every live child captured at call start. `scope: "selected"` requires `ids`; `scope: "all"` forbids `ids`. A successful proven boundary leaves only bounded history; an unproven boundary is reported as cleanup uncertainty and may retain leases or live owned work.

- `mode: "graceful"` is the default: request a concise final boundary, wait up to 10 seconds by default, then force abort if needed;
- `mode: "abort"` starts cleanup immediately;
- `gracePeriodSeconds` is capped at 60;
- removal returns bounded final output and atomically drains newly accrued usage;
- repeated exact-ID removal is idempotent.

`scope: "all"` acts on every live child captured at call start even if the bounded visible result cannot show all records.

## Workspace safety

### Shared workspace and child directories

`workspace.mode` currently supports only `"shared"`. `"worktree"` remains schema-visible for future compatibility but fails closed at runtime.

An optional `workspace.cwd` must already exist and must canonicalize beneath the parent workspace root. Escaping paths and symlinks are rejected.

### Read-only tools

Child `read`, `grep`, `find`, and `ls` are extension-owned same-name wrappers, not unrestricted inherited parent tools.

They:

- confine requested paths/search roots to the canonical shared workspace;
- reject escaping symlinks;
- structurally deny known credential, environment, key, session, and repository-metadata paths;
- bind direct file reads to a verified regular-file descriptor;
- keep traversal and output bounded;
- make `grep` use `rg --no-config` with a reduced operational environment, no downloads, protected-path exclusions, and cancellation-aware process cleanup;
- omit protected entries and symlinks from `find`/`ls` traversal.

This denylist is not a general secret detector. Ordinary project files may still contain private data, so do not assign children to inspect credential-bearing content.

### Guarded `edit` and `write`

Child `edit` and `write` require explicit tool selection. They use canonical path checks, generation-scoped file leases, descriptor-bound I/O, and Pi's normal per-file mutation queue.

Recommended writer specification:

```json
{
  "name": "focused-fix",
  "role": "Implement one reviewed change",
  "objective": "Update the parser and its focused test, then report exact files changed.",
  "complexity": "moderate",
  "tools": ["read", "grep", "edit", "write"],
  "workspace": {
    "mode": "shared",
    "writeScope": ["src/parser.ts", "test/parser.test.ts"]
  },
  "notifyOn": ["idle", "blocked", "failed"]
}
```

`writeScope` is an exact workspace-relative file allowlist for guarded `edit`/`write`:

- a nonempty scope is canonicalized and claimed atomically before child startup;
- an explicitly empty scope permits no file mutations;
- an omitted scope permits dynamic non-blocking claims anywhere inside the shared root;
- scope paths are exact files, not directory globs;
- a nonempty scope requires `edit` or `write`; a bash-only child with one fails closed;
- `writeScope` does not constrain arbitrary bash.

Idle children retain claimed file ownership for coherent follow-up work. Ownership remains until explicit release or a proven settlement/removal boundary. If removal cannot prove settlement, the removed record may retain cleanup uncertainty and conflicting leases until generation disposal.

### Guarded `bash`

Child bash requires all of:

```json
{
  "tools": ["read", "grep", "bash"],
  "workspace": {
    "mode": "shared",
    "bashPolicy": "workspace-exclusive"
  }
}
```

The spawn batch must then receive explicit operator approval. A bash-capable child owns the complete shared workspace for its assignment, retains that lease while idle, and reacquires ownership before later work if it was explicitly released. Release or remove an idle bash-capable child when other cooperating writers need the workspace. Tool batches containing bash execute sequentially within that child.

The wrapper:

- forwards timeout and abort behavior to Pi's bash backend;
- rejects the ordinary unquoted shell `&` background-job operator as defense in depth;
- removes ambient/session environment exposure, including `PI_*`, and passes only a fixed operational allowlist;
- caps forwarded output in memory and discards overflow with an inline marker instead of creating an extension-owned full-output temp artifact.

**Bash is not sandboxed.** After approval it runs as the Pi user and may read/write outside the workspace, use the network, inspect same-UID process state where the OS permits it, create its own files/logs, or launch a program that daemonizes. Whole-workspace ownership coordinates cooperating Pi mutators; it does not contain the command.

### Parent mutation coordination

The extension intercepts the main agent's built-in tools named `edit`, `write`, and `bash`:

- parent edit/write reserve the canonical target for that tool call;
- parent bash reserves the complete shared workspace;
- conflicting child claims or parent reservations fail before the cooperating mutation starts;
- exact reservations remain owned until matching tool completion.

The guarantee does **not** cover differently named mutating extension tools, `!`/`!!` user bash, external editors/processes, or deliberately detached descendants. It also does not provide read/write locks or an atomic multi-file read snapshot.

## Reporting and notifications

Every child has a bounded internal `report_to_parent` tool with `progress`, `blocked`, and `result` states.

- progress updates internal/TUI state only;
- blocked creates an authoritative blocker and may notify the parent;
- result becomes the assignment result after successful settlement;
- if no structured result is submitted, the final assistant text is the fallback.

Parent notifications are opt-in through each child's `notifyOn`. Configured idle-result, blocker, and failure events are coalesced into bounded `sub-agents-event` follow-up messages. A busy parent is not steered; an idle parent may be woken for one model turn.

## `/sub-agents` dashboard and widget

In TUI mode, `/sub-agents` opens a bounded list/detail dashboard. Other UI-capable modes receive a compact status notification; JSON/print modes do not open a custom component.

Dashboard keys:

| Key | Action |
|---|---|
| configured select up/down/Page Up/Page Down (defaults: arrows/Page keys) | Navigate the bounded list |
| configured select confirm (default: Enter) | Open exact child detail |
| configured cursor-left or select-cancel (defaults: Left or Escape/Ctrl+C) | Return from detail |
| `m` | Send a new assignment, follow-up, steer, or blocked resume |
| `l` | Confirm release of retained leases for an idle/blocked child |
| `x` | Confirm immediate removal/cleanup of the selected child |
| `X` | Confirm immediate removal/cleanup of all captured live children |
| `h` | Hide/show bounded historical records |
| `r` | Refresh |
| `q` / configured select-cancel (default: Escape/Ctrl+C) from list | Close |

The persistent TUI widget shows aggregate counts/usage and at most five prioritized live rows. It deliberately omits objectives, raw results, errors, and streaming text.

Dashboard removal is an immediate human control path, not the graceful model-callable removal flow. Because it is not a tool result, it cannot attach newly accrued child usage to Pi's built-in session totals.

## Usage accounting

Child usage is tracked per assignment and per reusable child. `sub_agents_spawn` returns before future usage exists, so it cannot retroactively attach that usage to its tool result.

Usage reaches Pi through atomic one-time drains:

- `sub_agents_wait` drains selected valid children when it returns, including timeout;
- `sub_agents_remove` drains removed targets;
- `sub_agents_status` drains only with `drainUsage: true`;
- repeated or concurrent drains report only usage accrued after the last successful watermark.

Unreported usage remaining at a lifecycle boundary is retained in bounded history but may not appear in Pi's built-in session totals. Restored historical usage is observational and is never drained into a replacement parent session.

## Session boundaries and persistence

Live children are memory-only and belong to one parent-session generation. Reload, new/resume, fork/clone, compaction, tree navigation, and shutdown stop accepting work, clean up children, invalidate IDs, release generation authority, and publish no old runtime into the replacement generation.

The extension writes strict branch-local `sub-agents-state-v1` checkpoints only at meaningful historical boundaries. Bounded history may include:

- opaque ID, name, role, and current objective summary;
- idle/blocked/failed/removed status and bounded result;
- nonsecret model route;
- usage totals and reported/unreported watermark;
- reported, modified, or formerly leased workspace-relative files;
- timestamps and removal reason.

It does not persist live sessions, child conversations, streaming previews, active tool calls, promises, controllers, lease tokens, provider configuration, or authentication data. Restored IDs remain inspectable history and cannot be revived.

Pi separately persists parent tool-call arguments, management-tool results (including bounded child reports/results), and model-visible custom notification messages according to normal session behavior. Do not place secrets in dynamic specs, messages, names, tags, paths, reports, or result instructions.

## Cancellation and cleanup

Cancellation propagates through child model resolution, session construction, prompt/resume boundaries, send retries, reconfiguration, waits, review dialogs, guarded traversal, and grep subprocesses.

Some side-effecting boundaries intentionally complete after cancellation begins so the extension does not hide uncertain outcomes:

- once wait usage drains start, the wait returns their result;
- once release side effects start, every selected release outcome completes;
- once removal cleanup starts, cleanup and usage accounting continue to a bounded result.

Partial initialization and runtime close use bounded abort/idle/dispose steps and observe late promise rejection. If cleanup cannot prove that owned work stopped, child/model/provider/process work may still be live even though the generation fails closed. Old lease authority is closed, replacement publication is blocked for that extension instance, and the manager remains inactive rather than risking overlap with uncertain work.

## Trust and security model

This extension provides capability restriction and cooperative coordination inside one Pi process. It is **not** a process, container, VM, privilege, or adversarial-code isolation boundary.

Important trust facts:

- every loaded global/project/package/temporary extension and provider implementation is in the same-process trusted computing base;
- child sessions use a fresh empty extension runtime and discover no arbitrary extensions, skills, prompts, themes, append prompts, or agent profiles;
- trusted project context is copied only from the parent turn's already loaded context snapshot; the child does no project-resource rediscovery;
- prompt instructions are guidance, not authorization—actual child tool definitions, path checks, scopes, and leases enforce capabilities;
- native provider/callback objects remain trusted in-process code;
- legacy provider mirroring accepts only environment references for secret-capable API-key/header fields and rejects literal secret values or credential-bearing URLs;
- automatic filtering cannot prove caller/model-controlled text or ordinary project files are nonsecret;
- bounded child reports/results and configured notifications are model-visible at their documented boundaries.

Use a trusted model for every child, especially any child granted `bash`. Do not delegate credential discovery or put credentials in tool arguments.

## Troubleshooting

### `manager_inactive` or `sub-agents: inactive`

The parent session may not have reached `session_start`, or a prior lifecycle cleanup may be unproven. Do not assume uncertain child/process work stopped. Inspect the host state, stop any known external work, and restart Pi before creating a new pool.

### `stale_agent` or an old ID no longer accepts work

A session-generation boundary occurred, including compaction or tree navigation. An old ID is inspectable only if a bounded checkpoint for it was restored from the current active branch; use `sub_agents_status({ includeRemoved: true })`. Otherwise treat it as stale and spawn a new live child if more work is needed.

### Automatic model route unavailable or ambiguous

Confirm the exact tier model IDs are available to the child runtime. Use `modelPolicy: "inherit"` or an exact `explicit` provider/model when appropriate. Custom legacy provider registrations must use environment references—not literal credentials—in secret-capable fields.

### Child has no project context

The parent project may be untrusted, no current parent context snapshot may exist, or the snapshot may have failed its bounds. Children never rediscover project context independently.

### `grep` fails

Ensure `rg` is already installed and reachable through the normal operational `PATH`. The extension does not download tools or honor user ripgrep config.

### `unsupported_workspace`

Worktree mode is deferred. Use `workspace.mode: "shared"`.

### Bash spawn is rejected

Bash-capable children require an approval-capable UI and explicit confirmation for the exact spawn batch. Headless/no-UI execution fails closed.

### Parent or child mutation is blocked

Use `sub_agents_status` to identify retained ownership. Wait for the current owner, remove it, or release an idle/settled-blocked owner. After resolving the conflict, call `sub_agents_send` to resume the blocked child. Never blindly retry a mutation whose prior outcome is uncertain.

### Usage is visible in status but absent from Pi totals

Drain it through `sub_agents_wait`, `sub_agents_remove`, or `sub_agents_status({ drainUsage: true })` before the lifecycle boundary. Historical usage is observational only.

## Offline development validation

From the repository root, run the complete automated suite with:

```bash
node agent/extensions/sub-agents/test/run-offline.mjs
```

The runner discovers regular `*.test.mjs` files in deterministic order, enables Node's TypeScript stripping, and launches one isolated test process with a reduced environment and disposable home/temp directories. Its preload guard blocks network clients, listeners, DNS lookups, datagrams, and unapproved subprocesses. Tests use in-memory fake model/session/provider responses, disposable workspaces, and local-only temporary Git repositories with isolated configuration, disabled hooks, and no remotes.

The suite requires the repository's existing installed dependencies, `rg` on the operational `PATH`, and a Node release that supports `--experimental-strip-types`. Its temporary-Git fixture self-test uses a local `git` executable when available and reports that one test as skipped when Git is absent. It does not install packages or contact providers, 1Password, databases, MCP servers, or other external services. The guard is a regression check for this trusted test suite, not a hostile-code OS sandbox.

## Development references

- [`SPEC.md`](./SPEC.md) — normative architecture, guarantees, and acceptance criteria.
- [`BACKLOG.md`](./BACKLOG.md) — implementation status, validation history, and next release task.

The separate manual TUI checklist remains tracked as `SA-705`.
