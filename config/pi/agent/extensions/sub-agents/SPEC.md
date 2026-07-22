# `sub-agents` Pi Extension — Architecture and Multi-Phase Implementation Specification

**Status:** Design approved; Phase 0 validation, Phase 1 skeleton, and Phase 2 dynamic in-process runtime are complete; Phase 3 control-plane work is underway with strict public schemas complete

**Extension name:** `sub-agents`

**Primary entry point:** `agent/extensions/sub-agents/index.ts`

**Backlog:** [`BACKLOG.md`](./BACKLOG.md)

## 1. Purpose

`sub-agents` will let the active Pi agent create, supervise, redirect, reuse, and remove task-specific sub-agents while it works. Sub-agents are created dynamically by the main agent for the exact needs of the current task. They are not selected from predefined personas or agent profile files.

The extension is a session-scoped orchestration layer over Pi's in-process SDK. Every sub-agent owns an isolated `AgentSession` and in-memory conversation while sharing a controlled view of the current project workspace.

The main agent remains the sole orchestrator and final decision-maker. The extension supplies lifecycle management, event delivery, workspace safety, usage accounting, and UI—not autonomous fleet planning.

## 2. Fixed Product Decisions

These decisions are requirements unless explicitly revised and recorded in both this specification and the backlog.

1. **No predefined agents.**
   - Do not load `~/.pi/agent/agents/*.md` or `.pi/agents/*.md`.
   - Do not ship roles such as scout, planner, reviewer, or worker.
   - Every sub-agent's role, objective, instructions, model, tools, and workspace policy are supplied dynamically by the main agent when it is created.

2. **Persistent pool, not disposable fleets.**
   - The main agent may add sub-agents incrementally throughout a task.
   - A sub-agent remains available after finishing a prompt so it can receive follow-up work with its existing context.
   - The main agent explicitly redirects, stops, or removes sub-agents.
   - There is no requirement to replace all active agents just because the task enters a new phase.

3. **In-process Pi SDK.**
   - Use `createAgentSession()` and `SessionManager.inMemory()`.
   - Do not spawn child `pi` CLI processes.
   - Each sub-agent must still have isolated messages, system prompt, model state, tools, compaction, retry state, and abort control.

4. **No fixed numeric concurrency ceiling.**
   - Do not define `MAX_AGENTS`, `MAX_CONCURRENCY`, a semaphore, or an implicit worker-pool limit.
   - All valid sub-agents requested by the main agent may start concurrently.
   - Provider rate limits, SDK retries, host resources, workspace leases, or explicit user/main-agent actions may delay work, but the extension must not reject creation merely because a count was reached.
   - The UI may warn about resource pressure without enforcing a count limit.

5. **Shared-workspace write conflicts must be prevented.**
   - Two sub-agents must not concurrently mutate the same shared file.
   - The main agent must also be prevented from mutating a file while a sub-agent owns its shared-workspace write lease.
   - Worktree-isolated agents may edit equivalent paths concurrently because their filesystems are separate.

6. **The main agent controls orchestration.**
   - The extension does not automatically invent a complete fleet, task graph, consensus protocol, or replacement agent.
   - It may report completion, blocking, failure, and resource events so the main agent can decide what to do next.

7. **Route model capacity to task complexity.**
   - Prefer `gpt-5.6-luna` for simple, narrow, latency-sensitive assignments.
   - Prefer `gpt-5.6-terra` for moderate analysis and implementation work.
   - Prefer `gpt-5.6-sol` for complex, ambiguous, high-stakes, architectural, or integration work.
   - The main agent classifies each dynamic assignment and may explicitly override the route.
   - Exact provider/model IDs must be resolved from Pi's model registry rather than assuming a provider name or exposing subscription credentials.

## 3. Goals

### 3.1 Primary goals

- Create one or many fully dynamic sub-agents without blocking on a predefined registry.
- Keep child model conversations isolated from the main conversation and from one another.
- Start sub-agent work in the background so the main agent can continue reasoning and managing the pool.
- Let the main agent inspect, message, redirect, wait for, stop, and remove sub-agents at any time between its own model turns.
- Route simple assignments to faster subscription models and reserve stronger models for work that benefits from them.
- Deliver important child events back to the main agent without flooding its context.
- Stream compact child activity into Pi's TUI.
- Prevent shared-workspace write collisions with enforceable tool wrappers and lease checks.
- Track child usage and expose it to the main agent and Pi session accounting where the extension API permits.
- Cancel and dispose all in-process sessions cleanly on Pi lifecycle boundaries.
- Keep model-visible output, persisted state, and UI state bounded.

### 3.2 Secondary goals

- Allow the main agent to choose or automatically route a different model and thinking level for each child.
- Allow an existing child to move to a faster or stronger model at a safe assignment boundary while retaining its context.
- Allow a child to remain idle with retained context and receive another assignment later.
- Allow optional tags or labels for organization without introducing a fleet lifecycle.
- Support both shared-workspace and future git-worktree workspace modes.
- Provide a branch-aware summary of completed sub-agent activity after Pi session restoration.

## 4. Non-goals

The first implementation will not:

- Ship reusable agent personas or prompt files.
- Spawn external Pi processes.
- Impose a fixed concurrent-agent count.
- Allow arbitrary project extensions or arbitrary custom tools inside child sessions.
- Guarantee coordination with external editors, unrelated OS processes, or mutating tools owned by unknown parent extensions.
- Automatically merge git worktrees in the shared-workspace MVP.
- Persist live `AgentSession` objects across Pi reloads, process restarts, session switches, forks, or tree navigation.
- Provide unrestricted peer-to-peer child communication.
- Let children create additional sub-agents recursively in the first implementation.
- Automatically retry side-effecting work after an uncertain failure.

## 5. Terminology

- **Main agent:** The active Pi session's model and agent loop.
- **Sub-agent:** One dynamically configured in-process `AgentSession` managed by this extension.
- **Agent specification:** The one-time dynamic creation request supplied by the main agent.
- **Assignment:** A prompt delivered to a sub-agent. A persistent sub-agent can process multiple assignments over its lifetime.
- **Manager:** The session-scoped registry and lifecycle owner of all sub-agents.
- **Workspace mode:** Shared project files or an isolated git worktree.
- **File lease:** Exclusive ownership of a canonical shared-workspace path by one agent.
- **Workspace lease:** Coarse exclusive ownership used when a tool such as unrestricted bash can mutate unknown paths.
- **Event inbox:** Bounded extension-owned queue of important child events waiting to be shown to the main agent.
- **Usage ledger:** Per-agent and aggregate counters, including whether usage has already been reported to Pi.
- **Complexity tier:** Main-agent-supplied classification of an assignment as `simple`, `moderate`, or `complex`.
- **Model route:** The requested model policy, resolved model, fallback path, and reason recorded for an assignment.

## 6. User and Main-Agent Experience

A typical interaction should look like this:

1. The user gives Pi a large task.
2. The main agent decides which independent investigations or implementation slices are useful now.
3. The main agent calls `sub_agents_spawn` with dynamic instructions for one or more agents.
4. The tool returns generated IDs immediately after the in-process sessions are successfully initialized and their initial assignments are launched.
5. The main agent continues working or creates more agents.
6. Child progress appears in a compact TUI widget/tool renderer.
7. Completion, blocker, and failure events are batched and delivered to the main agent at safe turn boundaries.
8. The main agent can call `sub_agents_status`, send follow-ups with `sub_agents_send`, change an agent's model tier with `sub_agents_reconfigure`, wait at a barrier with `sub_agents_wait`, or remove obsolete agents with `sub_agents_remove`.
9. Idle children retain their isolated context until explicitly removed or until the parent session shuts down.

The central interaction model is an evolving pool:

```text
main agent
  ├── creates agent A for current concern
  ├── creates agents B and C later
  ├── redirects A with new evidence
  ├── removes B when no longer useful
  ├── keeps C idle for a later follow-up
  └── creates D without rebuilding A/C
```

## 7. Dynamic Agent Specification

Every child is configured at creation time. The public schema should be strict, bounded, and contain no executable callbacks or secret-bearing fields.

Conceptual shape:

```ts
interface DynamicAgentSpec {
  name: string;
  role: string;
  objective: string;
  instructions?: string;
  context?: string;

  modelPolicy?: "auto" | "inherit" | "explicit";
  model?: {
    provider: string;
    id: string;
  };
  complexity?: "simple" | "moderate" | "complex";
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

  tools?: Array<"read" | "grep" | "find" | "ls" | "edit" | "write" | "bash">;
  workspace?: {
    mode: "shared" | "worktree";
    cwd?: string;
    writeScope?: string[];
    bashPolicy?: "disabled" | "workspace-exclusive";
  };

  resultInstructions?: string;
  tags?: string[];
  notifyOn?: Array<"idle" | "blocked" | "failed">;
}
```

### 7.1 Required fields

- `name`: Human-readable, task-specific display name. It is not a profile lookup key.
- `role`: The role invented by the main agent for this child.
- `objective`: The initial assignment.

### 7.2 Prompt construction

The child system prompt consists of:

1. A small extension-owned invariant protocol:
   - identify itself by generated ID and dynamic name;
   - stay within its assigned objective and tool capabilities;
   - report blockers and results through the provided reporting tool;
   - do not attempt to create sub-agents;
   - respect workspace lease errors;
   - never claim work was applied unless tools confirm it.
2. The main-agent-supplied dynamic role and instructions.
3. Approved project context files for the selected `cwd`.
4. Result-format instructions, if supplied.

The extension-owned invariant prompt is a safety/protocol harness, not a predefined agent persona. `SA-201` implements it as one deterministic protocol followed by a versioned `pi.sub-agent.assignment/v1` JSON envelope containing only the generated identity and dynamic role/objective/instructions/context/result instructions. Markup-significant characters and Unicode line separators are escaped without changing the parsed values, every field keeps the core contract bounds, and the final UTF-8 system prompt fails closed above 128 KiB. This structural escaping prevents dynamic text from breaking the assignment envelope; it does not turn prompt text into an authorization boundary.

The protocol requires `report_to_parent` for blockers/results when that tool is provided and a clear final-response fallback when it is not yet present. Actual tool availability, workspace scope, and lease enforcement remain authoritative over dynamic instructions.

`SA-202` supplies this prompt through one fully explicit child `ResourceLoader`. Each loader owns a fresh empty extension runtime, exposes no discovered extensions/skills/prompts/themes/append prompts, and rejects nonempty dynamic resource extension. Approved project context is added separately by Pi's normal system-prompt composition rather than being embedded into the dynamic assignment envelope.

### 7.3 Tool selection

- Tool availability is chosen per child by the main agent.
- Only extension-approved built-in wrappers and internal protocol tools are eligible in the initial implementation.
- Child sessions must not discover global or project extensions by default. This prevents recursion and unknown mutators.
- Internal tools are always explicit and minimal:
  - `report_to_parent`
  - optionally `claim_files` and `release_files` after the lease protocol is implemented
- `edit`, `write`, and `bash` are guarded wrappers, not unmodified built-ins.

### 7.4 Model selection and complexity routing

The main agent should classify the assignment when it creates or redirects a child. This is task metadata, not a predefined agent type.

Routing policy:

| Complexity | Preferred subscription model | Typical work |
|---|---|---|
| `simple` | `gpt-5.6-luna` | focused searches, file inventories, narrow summaries, mechanical checks, straightforward transformations |
| `moderate` | `gpt-5.6-terra` | cross-file tracing, ordinary debugging, bounded implementation, test analysis |
| `complex` | `gpt-5.6-sol` | architecture, ambiguous root-cause analysis, security-sensitive review, integration, conflict resolution |

Rules:

- Omitted `modelPolicy` defaults to `auto`.
- `auto` uses the supplied `complexity`; omitted complexity defaults conservatively to `moderate`/Terra.
- `inherit` resolves the main agent's provider/model at creation time and bypasses automatic tier routing.
- `explicit` requires the separate `model` provider/ID object, resolves it against the extension's shared `ModelRuntime`, and always overrides automatic routing.
- The separate policy enum avoids an object/string union in the eventual TypeBox schema and keeps string choices compatible with providers that require `StringEnum`.
- Routing is deterministic and does not make another model call merely to classify work.
- The extension adds prompt guidance so the main agent, which understands the current task, supplies the complexity tier.
- Thinking level is clamped by Pi to the selected child model's supported levels.
- Status and persisted summaries record requested complexity, selected model, route reason, and any fallback without exposing authentication.
- Failure to resolve a model or authentication must fail that child creation without exposing credential values.
- One invalid child in a batch must not prevent valid siblings from starting; return per-request outcomes.

Preferred fallback order when a subscription model is unavailable:

- `simple`: Luna → Terra → Sol → inherited main model.
- `moderate`: Terra → Sol → Luna → inherited main model.
- `complex`: Sol → Terra → inherited main model; do not silently downgrade complex work to Luna.

The technical validation phase must confirm the exact registry IDs/provider for `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol`. Display-name guessing is not sufficient.

## 8. Main-Agent Control Plane

Tool names use underscores because model-callable tool identifiers should be simple, while the extension directory remains `sub-agents`.

### 8.1 `sub_agents_spawn`

Purpose: Create one or many dynamic agents and launch their initial assignments without waiting for completion.

Key behavior:

- Accepts an array of dynamic specifications.
- Performs all validation before starting each individual child.
- Starts every valid child without a numeric concurrency semaphore.
- Returns generated opaque IDs and per-child initialization errors.
- Does not wait for child completion.
- Uses `executionMode: "parallel"` so independent spawn/control calls do not serialize unnecessarily; internal registry operations must be race-safe.
- Bounds one `sub_agents_spawn` call to 64 specifications for input/result transport safety. This is not an active-pool or concurrency ceiling: additional calls may keep adding children, and every valid entry in each call starts without a worker semaphore.

Example conceptual request:

```json
{
  "agents": [
    {
      "name": "trace-auth-flow",
      "role": "Investigate the authentication request path",
      "objective": "Map the exact files and functions involved in login and token refresh.",
      "tools": ["read", "grep", "find", "ls"],
      "modelPolicy": "auto",
      "complexity": "simple",
      "workspace": { "mode": "shared" }
    },
    {
      "name": "test-gap-analysis",
      "role": "Analyze existing tests and missing cases",
      "objective": "Find coverage gaps related to token refresh failures.",
      "tools": ["read", "grep", "find", "ls"],
      "modelPolicy": "auto",
      "complexity": "moderate",
      "workspace": { "mode": "shared" }
    }
  ]
}
```

### 8.2 `sub_agents_status`

Purpose: Return a bounded snapshot of all or selected children.

Fields should include:

- opaque ID, name, role, tags;
- lifecycle state;
- current assignment summary;
- requested complexity, model policy, selected model, route/fallback reason, and thinking level;
- active tool call summary;
- owned file/workspace leases;
- latest bounded report;
- turns, token usage, cost, and elapsed time;
- pending queued message count;
- last error or blocker;
- whether child usage remains unreported to Pi totals.

The default response is compact. An optional detail level may include a bounded recent event timeline, never an unbounded message history. Status reports usage totals without draining by default; `drainUsage: true` explicitly advances the atomic reported watermark.

### 8.3 `sub_agents_send`

Purpose: Redirect or extend one or more existing children.

Behavior:

- If a child is idle, use `session.prompt()` to start a new assignment.
- If a child is streaming, use `session.steer()` or `session.followUp()` according to the request.
- Support one message per target so the main agent can specialize follow-ups.
- Report acceptance per child.
- Preserve each child's prior context.
- Do not silently create a replacement if the target is absent or removed.

### 8.4 `sub_agents_reconfigure`

Purpose: Change the model tier/model and thinking level of an existing child without discarding its context.

Behavior:

- Accept `modelPolicy: "auto" | "inherit" | "explicit"`, an optional explicit model object, and a new complexity tier.
- Apply model/thinking changes immediately when the child is idle.
- If the child is running, queue the reconfiguration for the next safe assignment boundary unless the main agent explicitly requests abort-and-switch.
- Use `session.setModel()` and `session.setThinkingLevel()` through supported SDK APIs.
- Record the old model, new model, route reason, and assignment boundary in bounded state.
- Permit escalation from Luna → Terra → Sol when a task proves harder than expected and de-escalation for later simple follow-up work.
- Do not change workspace or tool capabilities in the first version.

### 8.5 `sub_agents_wait`

Purpose: Establish an explicit synchronization barrier while streaming status.

Behavior:

- Wait for `any` or `all` selected children to become idle, blocked, failed, or removed according to a requested condition.
- Allow a bounded caller-supplied timeout and abort signal.
- Stream compact state changes through `onUpdate`.
- Return final outputs and newly accrued usage for the selected children.
- Drain only previously unreported usage into the tool result to prevent double counting.
- Waiting does not remove the children.

### 8.6 `sub_agents_remove`

Purpose: Stop and dispose selected children or all children.

Modes:

- `graceful`: send a final instruction to summarize/stop, wait for a bounded grace period, then abort if needed.
- `abort`: immediately call `session.abort()`, await settlement, dispose, release leases, and mark removed.

The result must include any final bounded output and unreported usage available before disposal.

### 8.7 Optional later control tools

Do not implement until justified by actual use:

- `sub_agents_pause` / `sub_agents_resume`
- `sub_agents_clone_context`
- `sub_agents_move_to_worktree`
- `sub_agents_message_peer`

## 9. Sub-Agent Lifecycle

### 9.1 States

```text
creating
  ├──> running
  │      ├──> idle ──(new assignment)──> running
  │      ├──> blocked ──(resolved/redirected)──> running
  │      ├──> failed
  │      └──> stopping ──> removed
  └──> failed
```

Definitions:

- `creating`: Runtime/model/tools/session are being assembled.
- `running`: An assignment is actively streaming, retrying, compacting, or processing queued messages.
- `idle`: The last assignment settled successfully; session and context remain alive.
- `blocked`: The child explicitly reported a blocker or encountered a lease conflict requiring orchestration.
- `failed`: Initialization or agent execution failed and requires a main-agent decision.
- `stopping`: Graceful or forced removal is in progress.
- `removed`: Session disposed and leases released; retained only as bounded historical metadata.

### 9.2 Identity

- IDs are generated by the extension and are opaque, session-generation-scoped strings.
- Display names need not be unique; IDs always are.
- IDs from an old Pi session/reload generation must be rejected.

### 9.3 Persistent idle sessions

- `agent_settled` moves a successful child to `idle`, not `removed`.
- Idle sessions retain messages and may compact normally.
- The main agent decides when context is no longer useful and removes the child.
- Resource warnings may recommend removal but must not enforce an agent count limit.

## 10. In-Process SDK Architecture

### 10.1 Session construction

Each child uses:

- `createAgentSession()`;
- `SessionManager.inMemory(childCwd)`;
- a shared, lazily initialized extension-owned `ModelRuntime`;
- explicit `SettingsManager.inMemory()` settings;
- an explicit/minimal `ResourceLoader`;
- dynamic system prompt;
- only selected guarded tools and internal reporting tools.

`SA-203` implements the child construction boundary in `createSubAgentSession()`. It accepts an already resolved model/runtime, realpath-canonicalizes an existing shared child cwd beneath the realpath-canonical parent cwd, creates `SessionManager.inMemory(childCwd)` and `SettingsManager.inMemory()`, supplies the explicit loader, and exposes only an exact read-only built-in allowlist. Omitted tools default to `read`, `grep`, `find`, and `ls`; explicit subsets or no tools are allowed. Mutation-capable tools/policies and worktree mode fail closed until their safety phases. The factory validates the resulting public session ownership/model/tool contract, requires an event subscription before success, and performs best-effort unsubscribe, abort, idle settlement, and disposal after every partial post-creation failure. Returned `SubAgentSessionRuntime` cleanup is idempotent.

### 10.2 Resource isolation

The child resource loader must:

- return no discovered extensions;
- return no prompt templates;
- return no unrelated skills;
- return no themes;
- include only explicitly approved context files;
- avoid loading the `sub-agents` extension recursively;
- avoid project-local executable resources even if the parent project is trusted;
- use the dynamic child system prompt as its base prompt.

Production uses a fully explicit `ResourceLoader` backed by a fresh public `createExtensionRuntime()`, not `DefaultResourceLoader` discovery. Its extension, skill, prompt, and theme results are empty, its append-system-prompt list is empty, and nonempty dynamic resource extension is rejected. `DefaultResourceLoader` with every `no*` isolation flag and explicit prompt/context overrides was validated as functionally equivalent, but it still owns package/settings discovery machinery and therefore is not the fail-closed production choice.

Candidate context comes from the parent turn's already loaded `systemPromptOptions.contextFiles`; the child does not rediscover context or read agent-profile directories. Project context is copied into the child only when the parent context reports the project trusted. A missing, stale, or untrusted parent snapshot produces no child project context. The custom system prompt composition order is dynamic child prompt, approved `<project_context>`, then child working directory. Project-local extensions, prompt templates, skills, themes, append prompts, system prompt files, and agent profiles remain excluded even for trusted projects.

`SA-202` implements this as an immutable `ParentContextSnapshotV1` owned by the session-generation manager. The extension replaces it on every parent `before_agent_start`, clears it before a malformed replacement or manager disposal, and accepts it in a child loader only when its generation exactly matches. Untrusted context is neither inspected nor copied. Trusted path/content values are copied exactly without filesystem rereads and bounded to 64 files, 4,096 path characters, 256 KiB per file, and 1 MiB aggregate UTF-8 path/content bytes. Every child loader owns one stable fresh `createExtensionRuntime()` and returns defensive context copies; any nonempty `extendResources()` request fails closed.

### 10.3 Shared model runtime and provider mirroring

`ExtensionContext` exposes a `ModelRegistry` facade rather than the host `ModelRuntime` directly. The implementation should:

1. Lazily create one extension-owned `ModelRuntime` for all children.
2. Mirror host-registered providers into it using safe in-process APIs:
   - native providers from `getRegisteredNativeProvider()`;
   - effective legacy provider registrations from `getRegisteredProviderConfig()`.
3. Synchronize the registration set before each spawn/model-resolution boundary because the public extension API exposes no provider-registration change event.
4. Unregister a previously mirrored registration before re-registering its current host form. `ModelRuntime.registerProvider()` intentionally merges defined updates, so reset-then-register is required to avoid stale fields.
5. Never serialize provider config, auth results, headers, environment, API keys, OAuth callbacks, or credential state into tool arguments, results, errors, logs, snapshots, session entries, or UI.
6. Resolve the requested provider/model from the child runtime after mirroring.

Native providers and legacy OAuth callbacks can be mirrored through public objects without authenticating. Credentials are a separate concern: registration metadata does not transfer stored credentials, and the mirror must not call secret-returning `ModelRegistry` auth methods to copy them. The production child runtime must use a supported credential-store policy and treat a model without child-runtime auth as unavailable.

If exact host-provider behavior cannot be mirrored safely, fail that model selection explicitly rather than reaching into private fields or copying secrets through model-visible channels.

`SA-200` implements this boundary with one session-generation-owned `ChildModelRuntimeAdapter`. Its default factory lazily calls the supported `ModelRuntime.create({ allowModelNetwork: false })`, leaving credential resolution inside the child runtime rather than copying values from the parent registry. Offline tests inject an in-memory credential store. Synchronization and model resolution are serialized, stale registrations are removed, each current registration is reset before re-registration, and availability is refreshed without model-network access. Initialization, mirroring, availability, missing-model, and ambiguity errors expose only bounded provider/model identity. The manager disposes this adapter only after child runtime cleanup settles; disposing an unused adapter never creates a runtime.

### 10.4 Subscription model-tier router

The router is deterministic policy over models visible through the mirrored registry:

1. Resolve exact available models for the three preferred subscription tier IDs.
2. Prefer the main agent's current provider when that provider exposes the exact tier ID and is available.
3. Otherwise select only when exactly one available provider exposes that exact ID; fail with bounded nonsecret candidate metadata when several providers remain.
4. Match canonical model IDs only. Normalized display names may produce diagnostics but must never select a model.
5. Apply the complexity fallback order from section 7.4.
6. Return a `ModelRoute` containing requested policy, complexity, selected provider/ID, fallback steps, and nonsecret reason.
7. Cache only nonsecret model metadata and invalidate/synchronize it when host provider registrations change.
8. Expose routing guidance in `sub_agents_spawn` prompt guidelines so the main agent sends simple work to Luna, moderate work to Terra, and complex work to Sol.

Offline installed metadata confirms that `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol` are canonical IDs under multiple providers, including `openai` and `openai-codex`. The ID alone therefore cannot choose the subscription provider safely. The router must not inspect subscription credentials, make a classification model call, or hardcode a provider name; unresolved ambiguity requires an explicit provider/model choice.

`SA-207` implements this policy in `SubAgentModelRouter`. Missing or known-unavailable exact IDs advance through the documented tier order; ambiguous exact-ID matches and model-runtime infrastructure failures fail closed. Every success returns immutable bounded `ModelRoute` metadata with the requested policy/complexity, selected provider/ID/tier, attempted fallback path, fallback flag, and nonsecret reason. The assignment runner records a defensive manager-owned copy before the first child assignment, and each assignment snapshots the route active at its safe boundary. The exported `SUB_AGENT_MODEL_ROUTING_PROMPT_GUIDELINES` remains dormant until the Phase 3 `sub_agents_spawn` tool registers it; no global parent prompt is injected.

### 10.5 Background execution

- `sub_agents_spawn` launches each initial `session.prompt()` in a tracked background promise.
- Every promise has rejection handling immediately attached; there must be no unhandled rejection path.
- Registry state updates are serialized per agent ID but not through a global concurrency semaphore.
- The manager holds unsubscribe functions for every child event subscription.
- A child may receive steering/follow-up messages while active through SDK queueing APIs.
- Queued model reconfiguration is applied only at a safe assignment boundary.

`SA-205` implements this boundary in `SubAgentAssignmentRunner`. It creates the normalized child identity before invoking an internal model resolver, assembles the isolated session and translator, registers manager-owned cleanup, starts the assignment, and returns after Pi's supported prompt-preflight callback accepts the request. The full prompt remains an immediately rejection-observed manager background task. Unknown execution failures are replaced with bounded errors before entering manager state, while normal terminal model outcomes are translated from child events.

Each new prompt requires an initialized creating or idle child and creates one fresh assignment ID; steering and follow-up require a genuinely streaming child and remain within the current assignment. Per-child control operations serialize lifecycle races without serializing different children. Waits synchronize the prompt task and translator queue, and abort/removal races converge through idempotent manager-owned abort, settlement, translator closure, session disposal, and runtime-map removal.

### 10.6 Event subscription

Subscribe to each child session and translate SDK events into bounded internal records:

- `message_update`: update transient preview only; do not persist token deltas.
- `tool_execution_start/update/end`: update active tool summary and bounded timeline.
- `turn_end`: accumulate usage and latest assistant message.
- `agent_end`/settled equivalent: finalize assignment state.
- compaction/retry events: expose compact status without injecting raw details into the parent.

`SA-204` implements this boundary in `ChildEventTranslator`. Its synchronous public listener immediately reduces every SDK event to bounded primitives and schedules serialized manager work with rejection handling. Streaming text updates coalesce into one 2,000-character transient tail preview; thinking content, raw stream deltas, tool arguments, partial tool output, retry error strings, and complete event objects are never retained. Runtime activity keeps only its phase, pending-message count, aggregate active-tool count, and at most 32 bounded tool ID/name/timestamp summaries; this activity is excluded from `PersistedSubAgentHistoryV1` and cleared at every settled/cleanup boundary.

The translator records bounded tool/turn/compaction/retry milestones, accumulates assistant plus nested-tool usage once per `turn_end`, and includes compaction usage at `compaction_end`. Ordinary tool errors remain observable without forcing terminal failure. On `agent_settled`, the latest successful terminal response moves a running child to reusable `idle`, while a final model error or abort moves it to `failed`; an explicit `recordBlocker()` path supports later structured child reporting without guessing blockers from error text. Retry success replaces an earlier terminal failure. `flush()` and `close()` provide assignment-runner synchronization without making the `AgentSession` listener itself asynchronous.

## 11. Parent Notification Model

The main agent cannot call tools in the middle of generating a model response. "At any time" therefore means at safe Pi turn/tool boundaries, with background child events queued meanwhile.

### 11.1 Events delivered to the main agent

Notify only for meaningful changes:

- child became idle with a result;
- child became blocked;
- child failed;
- graceful stop needs escalation;
- workspace lease conflict needs orchestration.

### 11.2 Coalescing

- Batch events that occur close together into one custom message.
- Do not inject streaming deltas or every child tool call into main-agent context.
- Include IDs, names, state, and bounded summaries.
- Keep detailed timelines TUI-only or available via `sub_agents_status`.

### 11.3 Delivery

Use an extension custom message such as `customType: "sub-agents-event"`:

- deliver every important batch with `{ deliverAs: "followUp", triggerTurn: true }`;
- while the main agent is running, `followUp` queues the batch without steering or interrupting its current turn;
- while idle, `triggerTurn` starts one model turn for the coalesced batch;
- notify only for configured idle/completion, blocked, and failed events; progress remains TUI/internal state;
- prevent notification loops by marking extension-origin messages and allowing only translated child-manager events into the inbox;
- maintain one bounded inbox and one scheduled flush at a time, both cleared on shutdown.

## 12. Concurrency Model Without a Numeric Limit

### 12.1 Required behavior

- No fixed maximum agent count.
- No queue solely because N agents are already running.
- Batch creation starts every valid child concurrently.
- Existing agents continue while new ones initialize.

### 12.2 Natural backpressure

The implementation may encounter:

- provider 429/rate-limit responses;
- provider connection limits;
- model SDK retry delays;
- JavaScript event-loop pressure;
- memory growth from many retained contexts;
- workspace lease contention.

These are reported as runtime states, warnings, retries, or blockers. They are not converted into a hidden fixed concurrency cap.

### 12.3 Resource observability

The UI should show:

- creating/running/idle/blocked/failed counts;
- aggregate tokens and cost;
- approximate retained message count/context usage;
- optional process memory warning;
- provider retry/rate-limit states when available.

Warnings are advisory. The main agent or user chooses which children to remove.

## 13. Shared-Workspace Safety and File Leases

### 13.1 Threat model

Conflicts can occur among:

- two child `edit` calls on the same file;
- child `write` and child `edit` on the same file;
- main-agent `edit`/`write` and a child mutation;
- any `bash` call that can mutate unknown paths;
- multiple path aliases or symlinks referring to the same file;
- a file that does not yet exist;
- directory replacement/rename operations.

The first implementation guarantees coordination only for the main built-in tools intercepted by this extension and the guarded tools provided to children. External processes and unknown extension tools remain documented limitations.

### 13.2 Canonical paths

Before lease decisions:

1. Strip a leading `@` consistently with Pi built-ins.
2. Resolve relative to the child's effective `cwd`.
3. Normalize to an absolute path.
4. For existing paths, canonicalize through `realpath()`.
5. For new files, use the resolved absolute path and later reconcile canonical identity after creation.
6. Reject paths outside the allowed workspace root/write scope.

### 13.3 Lease types

#### File lease

- Exclusive ownership of one canonical path by one child agent.
- Acquired before the first mutation.
- Retained for the agent's assignment or until explicit release/removal.
- A conflicting child receives a structured lease error and becomes `blocked`; it does not wait while holding other contested leases.

#### Workspace lease

- Exclusive ownership of the whole shared workspace.
- Required for child `bash` when `bashPolicy` is `workspace-exclusive`.
- In the strict first version, a child with mutating bash acquires this lease for its full active assignment, because bash can write arbitrary files across multiple commands.
- Conflicts with all child file leases and parent mutation reservations.

#### Parent mutation reservation

- The extension intercepts main-agent `edit`, `write`, and `bash` through `tool_call`/`tool_result` events.
- Main `edit`/`write` reserves the canonical target for the duration of the tool call.
- Main `bash` reserves the shared workspace for the duration of the tool call.
- If a child holds a conflicting lease, block the main tool call with the owning child ID/name and tell the main agent to wait, redirect, release, or remove it.
- Child acquisition must also fail while a conflicting parent reservation is active.

### 13.4 Atomic claim rules

- If `writeScope` is supplied, acquire its canonical paths atomically in sorted order before the child starts mutating.
- All-or-nothing acquisition avoids partial ownership and deadlock.
- If paths are discovered dynamically, guarded `edit`/`write` attempt a non-blocking claim.
- A failed dynamic claim returns a blocker rather than waiting indefinitely.
- No agent waits for path B while retaining a newly acquired partial set from the same multi-path request.

### 13.5 Mutation queue

Guarded child tools are built by spreading the public `createEditToolDefinition()`, `createWriteToolDefinition()`, and `createBashToolDefinition()` results and overriding only `execute()`. This preserves strict schemas, argument preparation, prompt metadata, result/detail shapes, and renderers. The override canonicalizes and claims the file/workspace lease before delegating. Rejected claims never reach built-in operations, and the original abort signal and update callback pass through unchanged.

The built-in edit/write definitions already wrap the full access/read/write or mkdir/write window in Pi's `withFileMutationQueue()` and canonicalize existing symlink aliases. Do not add a second outer mutation queue around the delegated execute call. Leases protect ownership across agents; the built-in queue protects the actual per-file mutation window. Phase 5 must close the remaining claim-to-delegation path-identity race and reconcile new-file canonical identity after creation.

### 13.6 Bash policy

Bash cannot be reliably classified as read-only from shell text. Therefore:

- `bashPolicy: "disabled"` means no bash tool.
- `bashPolicy: "workspace-exclusive"` exposes guarded bash only after the workspace lease is acquired.
- Do not claim that regex command inspection makes arbitrary bash safe.
- Reject or explicitly document detached/background commands that could continue mutating after a tool result.
- Worktree mode later permits concurrent bash across separate worktrees.

### 13.7 Read consistency

The initial hard guarantee concerns concurrent mutation. A later option may provide read/write locks so a child cannot read a file mid-mutation. Direct built-in mutation windows are already short and queued, but multi-file operations may expose intermediate states.

### 13.8 Lease release

Release all leases when:

- the assignment is explicitly finalized and configured to release;
- the main agent removes the child;
- child initialization or execution fails terminally;
- the child session is disposed;
- Pi reloads, switches sessions, forks, navigates tree, or shuts down.

Whether idle children retain assignment leases must be explicit. Recommended default: retain declared/used leases while idle until the main agent removes the child or calls a future release operation, preventing another agent from interleaving edits with expected follow-up work.

## 14. Worktree Mode

Worktree support is a later phase but its boundaries must be designed now.

### 14.1 Behavior

- Create one isolated git branch and worktree for a child or a selected group.
- Child `cwd` points to that worktree.
- Equivalent relative paths in different worktrees do not conflict.
- File leases remain scoped by workspace identity, not only relative path.
- Child bash may mutate its own worktree without blocking agents in other worktrees.

### 14.2 Safety

- Require a git repository and cleanly validate paths.
- Never delete an unrecognized or non-extension-owned worktree.
- Track ownership with opaque IDs and metadata outside model-visible output.
- On removal, preserve commits/patches until the main agent or user chooses cleanup.
- Do not auto-merge without explicit authorization.
- Report branch, commit, patch, and conflict metadata in bounded form.

## 15. Internal Child Reporting Tool

A small custom child tool improves reliable communication without defining a persona.

Conceptual schema:

```ts
report_to_parent({
  state: "progress" | "blocked" | "result",
  summary: string,
  details?: string,
  files?: string[],
  needs?: string
})
```

Rules:

- `progress` updates TUI/internal state but does not automatically wake the main agent.
- `blocked` creates a coalesced main-agent event.
- `result` records a structured assignment result; the child still becomes idle only when its agent run settles.
- All fields are bounded.
- The tool cannot manipulate other children or leases directly in the MVP.

If the child never calls `report_to_parent`, its final assistant text becomes the fallback result.

## 16. Usage and Cost Accounting

### 16.1 Per-agent ledger

Track:

- input tokens;
- output tokens;
- cache read/write;
- total tokens/context tokens;
- provider-reported cost;
- turns;
- assignment count;
- amount already reported to the parent Pi session.

### 16.2 Background accounting limitation

Because `sub_agents_spawn` returns before child completion, future usage cannot be attached retroactively to that tool result.

Solution:

- Every management tool drains newly accrued, previously unreported child usage into its own result `usage` when applicable.
- `sub_agents_wait` and `sub_agents_remove` are the primary accounting boundaries.
- `sub_agents_status` may optionally drain usage; this must be explicit to avoid surprising repeated totals.
- Usage deltas must be marked reported atomically so retries or repeated status calls cannot double count.
- Any unreported usage remaining at shutdown is preserved in bounded custom state/history but may not appear in Pi's built-in session totals; document this limitation.

`SA-206` implements immutable ledger operations for per-child totals, the current assignment's isolated totals, and the reported watermark. Token and turn counts require non-negative safe integers, cost requires a finite non-negative number, and a whole update validates before manager state changes. `SubAgentManager.drainUsage()` runs on the existing per-child operation queue, advances the reported watermark atomically, and returns zero to every later drain until more usage accrues. Concurrent usage updates and drains therefore neither lose nor double-report counters. Assignment-local usage remains attached to its assignment record through settlement; aggregate child totals persist across reusable assignments.

## 17. Persistence and Session Boundaries

### 17.1 Runtime state

Live child sessions are memory-only and belong to one parent session generation.

On `session_shutdown`, reload, new/resume/fork, or relevant tree navigation:

1. stop accepting new child operations;
2. abort running children;
3. await bounded settlement;
4. unsubscribe listeners;
5. dispose sessions;
6. release every lease and parent reservation;
7. clear timers and notification flushes;
8. persist a bounded historical snapshot if appropriate.

### 17.2 Persisted summaries

Use `pi.appendEntry("sub-agents-state-v1", ...)` or bounded tool-result details for:

- generated child ID and dynamic name;
- role/objective summary;
- terminal/last-known state;
- bounded final result;
- aggregate usage/cost;
- files reported/leased;
- timestamps and removal reason.

Never persist:

- raw provider auth;
- full unbounded child conversations;
- full streaming deltas;
- private runtime objects;
- abort controllers, promises, subscriptions, or tool instances.

### 17.3 Restore semantics

On parent `session_start`:

- restore historical records only from the active branch;
- mark all formerly live children as historical/terminated;
- never pretend an in-process child survived restart;
- do not reuse old opaque IDs as active IDs;
- show history in `/sub-agents` without injecting it into the model unless requested.

## 18. TUI and Commands

### 18.1 Persistent widget

A compact widget may show:

```text
sub-agents: 3 running · 2 idle · 1 blocked · $0.1842
  a7f2 trace-auth-flow       running  grep src/auth
  b19c test-gap-analysis     idle     result ready
  c831 token-fix             blocked  lease: src/auth/token.ts
```

Requirements:

- update via child events;
- bound visible rows and summarize overflow;
- use theme callbacks and invalidate correctly;
- avoid exposing raw prompts or sensitive child output by default;
- remove widget when no live/historical display is requested.

### 18.2 `/sub-agents`

A user command opens a detailed TUI panel in interactive mode and prints/returns a compact status in non-TUI-compatible modes where possible.

Possible actions:

- inspect a child;
- view bounded recent events;
- stop/remove one or all;
- send a message manually;
- release leases after confirmation;
- view aggregate usage;
- view historical child summaries.

The command is for the human operator. The model uses control-plane tools.

### 18.3 Tool renderers

Each management tool should have compact and expanded renderers. Renderers must support partial results for `sub_agents_wait`, reuse components where practical, and keep all lines within terminal width.

## 19. Error Handling

- Child creation errors are isolated per requested child.
- All background promises attach rejection handlers immediately.
- A child model error sets `failed` and emits one coalesced notification.
- Child tool execution errors remain in that child's context and bounded timeline.
- Lease conflicts are normal blockers, not extension crashes.
- `session.abort()` and `dispose()` must be idempotent.
- Manager shutdown must use `Promise.allSettled()`-style cleanup semantics.
- Never automatically retry a mutation after outcome uncertainty.
- Tool implementations signal actual failure by throwing where Pi expects `isError: true`; logical per-child batch failures may be represented as structured outcomes when partial success is valid.

## 20. Security and Trust Model

- All extension code and all dynamically supplied child prompts execute inside the same Pi process and trust boundary.
- Dynamic prompts are model-visible/session-visible data, not authorization.
- Child tools enforce capabilities independently from prompt wording.
- Child sessions do not load arbitrary extensions in the MVP.
- Project context is included only according to explicit parent trust policy.
- Child `cwd` must be canonicalized and constrained to the trusted project root unless the user explicitly authorizes another root.
- Do not pass credentials in dynamic specs, tool arguments, results, logs, widgets, or persisted summaries.
- Provider registration/auth mirroring stays in memory and is never surfaced.
- Unknown parent extension tools may mutate files outside this lease manager; this residual limitation must be visible in README documentation.
- Tests use fake models, fake clients, temporary directories, and fake values only. They must not contact providers, 1Password, databases, MCP servers, or other external services.

## 21. Planned Module Layout

```text
agent/extensions/sub-agents/
├── index.ts                     # Extension registration and lifecycle wiring
├── SPEC.md                      # This specification
├── BACKLOG.md                   # Resumable implementation backlog
├── README.md                    # User-facing documentation after MVP
├── types.ts                     # Public/internal bounded data contracts
├── manager.ts                   # Session-scoped registry and lifecycle state machine
├── agent-runtime.ts             # createAgentSession adapter and required subscription
├── assignment-runner.ts         # Reusable background prompt/control assignment lifecycle
├── event-translator.ts          # Bounded child SDK event/activity/lifecycle translation
├── model-runtime.ts             # Shared ModelRuntime and provider mirroring
├── model-router.ts              # Luna/Terra/Sol complexity routing and fallbacks
├── prompt-builder.ts            # Bounded invariant protocol and dynamic assignment envelope
├── resource-loader.ts           # Minimal isolated child ResourceLoader
├── notifications.ts             # Main-agent event coalescing/delivery
├── persistence.ts               # Bounded branch-aware snapshots
├── usage-ledger.ts              # Delta accounting and Pi usage reporting
├── workspace/
│   ├── paths.ts                 # Canonicalization and root/scope validation
│   ├── leases.ts                # File/workspace/parent reservations
│   ├── guarded-tools.ts         # Child read/edit/write/bash wrappers
│   └── worktrees.ts             # Later phase
├── tools/
│   ├── schemas.ts               # TypeBox schemas
│   ├── spawn.ts
│   ├── status.ts
│   ├── send.ts
│   ├── reconfigure.ts
│   ├── wait.ts
│   ├── remove.ts
│   └── report-to-parent.ts      # Child-only internal tool
├── ui/
│   ├── renderers.ts
│   ├── widget.ts
│   └── dashboard.ts
└── test/
    ├── fakes.ts
    ├── manager.test.ts
    ├── runtime.test.ts
    ├── model-router.test.ts
    ├── leases.test.ts
    ├── tools.test.ts
    ├── notifications.test.ts
    ├── persistence.test.ts
    └── lifecycle.test.ts
```

The actual layout may be simplified while modules remain small, testable, and dependency-directed.

## 22. Multi-Phase Implementation Plan

### Phase 0 — Technical validation

Goal: Prove uncertain SDK and lifecycle assumptions before building the full extension.

Deliverables:

1. Create two concurrent in-process `AgentSession`s with fake model streams and `SessionManager.inMemory()`.
2. Verify each session has isolated messages and can run concurrently.
3. Verify a child remains usable after its first `prompt()` settles.
4. Verify `steer`, `followUp`, `abort`, and `dispose` behavior under races.
5. Verify dynamic model resolution using a shared extension-owned `ModelRuntime` and mirrored host provider registration without logging auth.
6. Verify exact registry resolution and deterministic routing for `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol` using fake provider/model metadata.
7. Verify a minimal resource loader excludes extensions while accepting dynamic prompts and selected context.
8. Verify guarded built-in tool wrapping can preserve exact Pi result/detail shapes.
9. Verify background completion can safely queue one coalesced custom message to the parent.

Exit criteria:

- Every uncertain assumption has an offline test or documented limitation.
- No production architecture depends on private SDK fields.
- The backlog records any required spec revision.

### Phase 1 — Extension skeleton and state model

Goal: Establish the extension package without starting real child model calls.

Deliverables:

- directory/module skeleton;
- strict core types and state machine;
- opaque ID generation with session generation;
- manager registry with idempotent create/remove transitions;
- session lifecycle hooks and empty cleanup path;
- `/sub-agents` basic status command;
- bounded internal event record type;
- offline unit tests for state transitions and cleanup.

Exit criteria:

- Reload/new/resume/fork/shutdown leave no timers, subscriptions, or leases.
- Invalid transitions fail deterministically.

### Phase 2 — Dynamic in-process runtime

Goal: Create arbitrary dynamic children with read-only tools and keep them alive.

Deliverables:

- shared model runtime adapter;
- provider mirroring;
- Luna/Terra/Sol complexity router with deterministic fallbacks;
- main-agent model-routing prompt guidance;
- dynamic prompt builder;
- minimal child resource loader;
- child session factory;
- event subscription and assignment tracking;
- read-only child tool selection;
- persistent idle child behavior;
- per-agent usage ledger;
- fake-runtime integration tests.

Exit criteria:

- The main control layer can start multiple dynamic read-only children concurrently with no numeric semaphore.
- Simple, moderate, and complex automatic routes resolve to Luna, Terra, and Sol respectively when those models are available.
- Each child can complete, remain idle, accept another assignment, and retain bounded route state for a later safe-boundary model change.

`SA-209` validates the completed Phase 2 production path offline: three routed child sessions overlap behind a deterministic fake-provider barrier, receive distinct isolated prompts, contain a synthetic sibling failure, and preserve one successful idle transcript for a follow-up assignment. Safe-boundary model switching remains the Phase 3 `sub_agents_reconfigure` control operation built on the validated reusable session and route state.

### Phase 3 — Main-agent control tools

Goal: Give the main model full incremental lifecycle control.

Deliverables:

- `sub_agents_spawn`;
- `sub_agents_status`;
- `sub_agents_send`;
- `sub_agents_reconfigure`;
- `sub_agents_wait`;
- `sub_agents_remove`;
- strict bounded TypeBox schemas using `StringEnum` where required;
- per-child partial success reporting;
- usage-delta draining;
- compact fallback renderers.

Exit criteria:

- Main agent can add and remove children without rebuilding the pool.
- Running and idle children can be redirected.
- Idle children can change model immediately; running children can queue a safe-boundary model change.
- Wait/abort/reconfigure races do not leak sessions.

### Phase 4 — Notifications and observability

Goal: Let the main agent and human operator understand background activity without context flooding.

Deliverables:

- child `report_to_parent` tool;
- bounded event inbox;
- completion/blocker/failure coalescing;
- safe parent message delivery;
- persistent status widget;
- expanded tool renderers;
- `/sub-agents` dashboard;
- tests for event storms and notification-loop prevention.

Exit criteria:

- Many near-simultaneous completions produce one bounded parent notification batch.
- Streaming deltas never enter parent context or persisted history unboundedly.

### Phase 5 — Shared-workspace mutation safety

Goal: Permit controlled child edits without concurrent same-file mutation.

Deliverables:

- canonical path and root/scope validation;
- file/workspace lease manager;
- atomic declared-scope claims;
- dynamic non-blocking claims;
- guarded `edit` and `write` preserving built-in result shapes;
- guarded workspace-exclusive `bash` policy;
- `withFileMutationQueue()` integration;
- parent `tool_call`/`tool_result` reservations for edit/write/bash;
- blocker events and lease display;
- deterministic concurrency tests with barriers and symlink aliases.

Exit criteria:

- Two children cannot concurrently mutate the same canonical shared file.
- Main and child mutations cannot overlap on a leased file/workspace.
- Different files can be edited concurrently when no workspace lease exists.
- Every failure/shutdown path releases ownership.

### Phase 6 — Persistence and branch/session correctness

Goal: Preserve useful history while guaranteeing live-session invalidation.

Deliverables:

- versioned bounded custom entry schema;
- branch-aware historical reconstruction;
- old-generation ID rejection;
- compaction/tree/reload/session-replacement behavior;
- unreported usage snapshot behavior;
- tests covering resume/fork/tree boundaries using in-memory/fake session managers.

Exit criteria:

- No live child is claimed after runtime replacement.
- Historical summaries follow the active branch.

### Phase 7 — Hardening and documentation

Goal: Make the shared-workspace release maintainable and safe.

Deliverables:

- user-facing README;
- exact trust/security limitations;
- model/provider compatibility notes;
- Luna/Terra/Sol routing, fallback, explicit override, and reconfiguration behavior;
- cancellation and timeout behavior;
- output truncation throughout;
- no-secret/logging review;
- offline test runner;
- TypeScript/typecheck/lint validation using existing project tooling;
- manual TUI test checklist.

Exit criteria:

- All tests are offline and use fake providers/clients.
- No dependency installation or network access is required without explicit approval.
- Documentation matches actual behavior.

### Phase 8 — Git worktree isolation

Goal: Allow truly parallel writers without shared-path conflicts.

Deliverables:

- extension-owned worktree lifecycle manager;
- branch/worktree naming and ownership metadata;
- per-worktree workspace identity;
- commit/patch/result collection;
- conflict reporting;
- explicit cleanup and merge commands/flows;
- tests using temporary local git repositories only.

Exit criteria:

- Agents in separate worktrees can edit equivalent relative paths concurrently.
- No worktree is deleted or merged implicitly.

### Phase 9 — Optional advanced capabilities

Evaluate only after real MVP usage:

- context cloning/handoff between selected children;
- opt-in peer messaging routed through the manager;
- pause/resume semantics;
- richer resource-pressure telemetry;
- sandboxed read-only shell;
- declarative result schemas;
- external artifact storage with strict bounds and cleanup;
- user-configurable advisory policies that remain non-hard concurrency guidance.

## 23. Testing Strategy

### 23.1 Unit tests

- lifecycle transition table;
- ID generation/generation invalidation;
- schema bounds and validation;
- deterministic complexity routing, fallback order, and explicit override;
- usage delta accounting/no double counting;
- notification batching;
- path canonicalization;
- lease atomicity, conflicts, release, and deadlock avoidance;
- output truncation.

### 23.2 Integration tests

Use fake SDK session/model factories:

- concurrent child prompts complete in different orders;
- simple/moderate/complex routes select Luna/Terra/Sol from fake registry metadata;
- missing-tier fallback and explicit model override;
- safe-boundary model escalation/de-escalation with context retained;
- one child fails while siblings continue;
- child remains idle and receives a new assignment;
- steering/follow-up races;
- remove during model stream/tool call/retry;
- parent notification while parent is idle vs streaming;
- reload/shutdown during active children;
- same-file edit collision;
- different-file concurrent edits;
- workspace-exclusive bash collision;
- symlink alias collision;
- usage drain across status/wait/remove.

### 23.3 Manual TUI tests

- widget at narrow/wide widths;
- expanded/collapsed renderers;
- theme change invalidation;
- dashboard navigation and cancel;
- high event volume remains responsive;
- Escape/abort behavior;
- notification coalescing readability.

### 23.4 Prohibited test behavior

- Do not inspect or use `agent/auth.json`.
- Do not inspect existing `agent/sessions/**`.
- Do not read project credential files or `.env` files.
- Do not contact live model providers or other external services.
- Do not install/update dependencies without explicit user approval.

## 24. Acceptance Criteria for the First Stable Release

The shared-workspace release is complete when:

1. The main agent can dynamically define and create arbitrary sub-agents with no profile lookup.
2. Multiple valid agents start concurrently without a fixed numeric extension limit.
3. The main agent can add more children while prior children run or remain idle.
4. The main agent can message, wait for, inspect, abort, and remove selected children.
5. Child conversations are isolated and reusable across assignments.
6. Completion/blocker/failure events reach the main agent in bounded coalesced messages.
7. Shared-file mutation collisions are prevented among guarded children and intercepted main built-in tools.
8. Different shared files may be edited concurrently.
9. All active children and leases are cleaned up on every Pi session lifecycle boundary.
10. Child output and persisted metadata are bounded.
11. Usage is tracked per child and delta-reported without double counting.
12. All automated tests run offline with fake model/session infrastructure.
13. Security and coordination limitations are documented honestly.
14. Automatic routing uses `gpt-5.6-luna` for simple work, `gpt-5.6-terra` for moderate work, and `gpt-5.6-sol` for complex work when available, while explicit main-agent model choices remain authoritative.

## 25. Known Risks and Open Questions

Track resolution in `BACKLOG.md`.

1. **Host model runtime access:** Extensions receive `ModelRegistry`, not the private host `ModelRuntime`; provider mirroring needs validation across built-in, custom, OAuth, and native providers.
2. **Background usage totals:** Pi cannot retroactively attach child usage to an already returned spawn result.
3. **Parent notifications:** Triggering main-agent turns from background completions must not create loops or excessive turns.
4. **Bash mutation scope:** Arbitrary shell commands cannot be safely reduced to file-level claims in a shared workspace.
5. **Unknown parent tools:** Other extensions may mutate files without participating in this lease manager.
6. **Idle lease ownership:** Retaining leases protects follow-up coherence but can block unrelated work; the UI and main tool API must make ownership obvious.
7. **Context memory:** No agent-count limit means many idle contexts can consume memory; observability and explicit removal are essential.
8. **Tree navigation:** Historical snapshots must remain branch-correct while live agents are invalidated.
9. **Dynamic prompt trust:** The main model creates child instructions; capability enforcement must never rely on those instructions being benign.
10. **Subscription model identity:** Exact provider/model IDs and relative capabilities must be verified from the model registry; ambiguous display-name matching or stale provider mirroring could route incorrectly.

## 26. Change-Control Rules

When implementation discovers a conflict with this design:

1. Do not silently change a fixed product decision.
2. Add an entry under the backlog's decision/change log.
3. Update this specification and relevant acceptance criteria together.
4. Record migration implications for persisted state or tool schemas.
5. Keep old session tool calls compatible through `prepareArguments` when a released schema changes.
