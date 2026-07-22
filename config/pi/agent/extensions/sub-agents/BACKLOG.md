# `sub-agents` Implementation Backlog and Session Handoff

**Specification:** [`SPEC.md`](./SPEC.md)

**Current stage:** Phase 4 notifications and observability are in progress; the child reporting boundary is complete and event coalescing is next

**Current milestone:** Phase 4 — notifications and observability

**Next recommended item:** `SA-401`

This file is the resumable source of truth for implementation progress. Future sessions should update it before stopping so another session can continue without reconstructing decisions from conversation history.

## 1. Resume Protocol for Future Sessions

At the beginning of every implementation session:

1. Read the project `CLAUDE.md` instructions.
2. Read [`SPEC.md`](./SPEC.md) completely.
3. Read this backlog completely.
4. Inspect git status without reading sensitive files.
5. Do not inspect `agent/auth.json` or `agent/sessions/**`.
6. Preserve unrelated/pre-existing working-tree changes.
7. Find the first unblocked item marked `NEXT`, then `READY`.
8. Confirm its dependencies and acceptance criteria before editing.
9. Use fake clients/models and temporary files for all tests.
10. Before ending the session:
    - update item statuses;
    - record files changed;
    - record validation commands and results;
    - record unresolved issues;
    - set exactly one recommended next item when possible;
    - append a handoff log entry.

## 2. Status Legend

- `DONE` — implemented and validated.
- `IN PROGRESS` — actively being implemented; handoff notes must explain remaining work.
- `NEXT` — recommended next item.
- `READY` — dependencies satisfied.
- `BLOCKED` — cannot proceed; blocker and owner/decision needed must be recorded.
- `DEFERRED` — intentionally postponed beyond the current release.
- `CANCELLED` — no longer planned; reason required.

Checkboxes indicate completion only:

- `[x]` completed
- `[ ]` not completed, regardless of READY/BLOCKED/DEFERRED state

## 3. Fixed Decisions Checklist

Future changes to these require an explicit spec and decision-log update.

- [x] `DEC-001` — Extension directory/name is `sub-agents`.
- [x] `DEC-002` — Agents are created dynamically by the main agent; no predefined agent profiles.
- [x] `DEC-003` — Use in-process `createAgentSession()`, not child Pi processes.
- [x] `DEC-004` — Maintain an evolving session-scoped pool; do not recreate a whole fleet for each phase.
- [x] `DEC-005` — No fixed numeric concurrent-agent limit or semaphore.
- [x] `DEC-006` — Shared-workspace same-file mutation conflicts must be prevented.
- [x] `DEC-007` — Worktree-isolated agents may edit equivalent paths concurrently.
- [x] `DEC-008` — The main agent owns decomposition, creation, redirection, and removal decisions.
- [x] `DEC-009` — Child sessions do not discover arbitrary extensions in the MVP.
- [x] `DEC-010` — Idle children retain context and can receive later assignments.
- [x] `DEC-011` — Route simple work to `gpt-5.6-luna`, moderate work to `gpt-5.6-terra`, and complex/high-stakes work to `gpt-5.6-sol`, subject to exact registry resolution and explicit main-agent override.

## 4. Current Repository Notes

These notes prevent future sessions from accidentally overwriting unrelated work.

- The `sub-agents/` directory now contains the production Phase 1 entry point/state manager, the complete Phase 2 shared child runtime (model adapter/router, bounded prompt/resources, read-only session factory, event translator, reusable assignment runner, and atomic usage ledger), the validated six-tool Phase 3 control plane, the Phase 4 child-only `report_to_parent` boundary, focused production/integration/race tests, planning documentation, and the five offline Phase 0 SDK spike suites.
- At planning time, git reported `agent/extensions/dynamic-fleet.ts` as deleted in the pre-existing working tree. Do not restore or repurpose it unless the user explicitly asks.
- At planning time, `agent/models-store.json` and `agent/settings.json` already had unrelated modifications. Do not overwrite or revert them.
- No dependencies have been installed for `sub-agents`.
- No external services or live model providers have been contacted.

## 5. Milestone Summary

| Phase | Milestone | Status | Exit gate |
|---|---|---|---|
| 0 | Technical validation | DONE | SDK assumptions proven offline |
| 1 | Skeleton and state model | DONE | Lifecycle manager works without real model calls |
| 2 | Dynamic in-process runtime | DONE | Concurrent reusable read-only children work |
| 3 | Main-agent control tools | DONE | Main can incrementally manage pool |
| 4 | Notifications and observability | IN PROGRESS | Bounded event delivery and TUI work |
| 5 | Shared-workspace mutations | READY | Same-file/main-child collisions prevented |
| 6 | Persistence/session correctness | BLOCKED by Phases 4–5 | Historical state is branch-safe; live state invalidates |
| 7 | Hardening and docs | BLOCKED by Phases 0–6 | First stable shared-workspace release |
| 8 | Git worktrees | DEFERRED | Isolated writers supported safely |
| 9 | Advanced capabilities | DEFERRED | Evaluated from real usage, not speculation |

---

# Phase 0 — Technical Validation

## `SA-001` Design specification and resumable backlog

**Status:** DONE

**Dependencies:** none

- [x] Record fixed product decisions.
- [x] Define architecture, lifecycle, control plane, concurrency, workspace safety, persistence, and phases.
- [x] Create a future-session resume protocol and backlog.

**Artifacts:**

- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`

## `SA-010` Concurrent in-process AgentSession spike

**Status:** DONE

**Dependencies:** `SA-001`

Goal: prove that multiple child `AgentSession`s can run concurrently and remain reusable without a child CLI process.

Tasks:

- [x] Identify the smallest supported fake model/stream interface for offline SDK tests.
- [x] Create two `SessionManager.inMemory()` child sessions.
- [x] Start both prompts without awaiting the first before starting the second.
- [x] Use deterministic barriers so the test proves overlap rather than merely eventual completion.
- [x] Verify message arrays and tool events are isolated.
- [x] Verify one child failure does not cancel the sibling.
- [x] Verify a settled child accepts a second `prompt()` with prior context retained.
- [x] Call `dispose()` and verify subscriptions/resources are released.
- [x] Record exact supported APIs and any divergence from `SPEC.md`.

Acceptance criteria:

- [x] Entire test runs offline with fake values.
- [x] No `agent/auth.json`, existing sessions, environment credentials, or live provider calls are used.
- [x] Concurrent overlap is deterministic in the test.
- [x] No unhandled promise rejection occurs.

Artifacts:

- `agent/extensions/sub-agents/test/agent-session-spike.test.mjs`

Validated public API findings:

- `@earendil-works/pi-ai` exports `fauxProvider()`, `fauxAssistantMessage()`, and `fauxToolCall()` for deterministic offline streams. A faux provider can be installed through the public `ModelRuntime.registerNativeProvider()` API.
- Two `createAgentSession()` calls can share one `ModelRuntime` and model while using separate `SessionManager.inMemory()`, `SettingsManager.inMemory()`, and resource-loader instances.
- Starting both `prompt()` promises before awaiting either produces genuine overlap; the test uses a two-party barrier and fails on timeout if requests serialize.
- An assistant response with `stopReason: "error"` settles that session without rejecting `prompt()` or cancelling a sibling session. Managers must inspect child events/messages rather than assume a resolved prompt means success.
- A successful settled session emits `agent_settled`, remains idle, accepts another `prompt()`, and retains its prior transcript.
- Tool execution and session message events remain local to the owning session.
- `AgentSession.dispose()` is synchronous and observably disconnects session subscribers and session persistence. It does not destroy the underlying low-level `Agent` or the shared `ModelRuntime`; the manager must abort/wait before disposal and separately own shared-runtime lifecycle.
- A `DefaultResourceLoader` with every discovery category disabled gives the spike an explicit no-extension/no-skill/no-prompt/no-theme/no-context environment. The stricter production child loader remains work for `SA-012`.

Specification impact:

- No fixed product decision changed.
- The lifecycle implementation must treat `dispose()` as disconnection, not as proof that an active provider request was aborted; call `abort()`/`waitForIdle()` first.

## `SA-011` Host model/provider mirroring spike

**Status:** DONE

**Dependencies:** `SA-010`

Goal: establish a supported way to resolve child models using one extension-owned `ModelRuntime` while matching host provider registrations.

Tasks:

- [x] Create one lazy `ModelRuntime` in a test adapter.
- [x] Inspect and use only public `ModelRegistry` methods.
- [x] Mirror registered native providers.
- [x] Mirror registered provider configs.
- [x] Resolve an inherited provider/model by provider and ID.
- [x] Resolve fake registry entries representing `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol` by canonical ID.
- [x] Determine the exact configured provider/model IDs for the real subscription later through model metadata only, without contacting providers in offline tests.
- [x] Verify ambiguous display names fail instead of silently selecting the wrong provider/model.
- [x] Verify provider mirroring never serializes auth/config into result text, errors, or snapshots.
- [x] Test a fake custom provider.
- [x] Test missing model and missing auth failures.
- [x] Determine OAuth/provider compatibility limits without authenticating.
- [x] Document whether provider updates after child-runtime creation need resynchronization per spawn.

Acceptance criteria:

- [x] No private `ModelRegistry.runtime` access.
- [x] No credential values in logs, assertions, fixtures, or errors.
- [x] Unsupported provider cases fail closed with useful nonsecret errors.

Artifacts:

- `agent/extensions/sub-agents/test/model-runtime-spike.test.mjs`
- `agent/extensions/sub-agents/test/installed-packages.mjs`

Validated public API findings:

- `ModelRegistry.getRegisteredProviderIds()`, `getRegisteredNativeProvider()`, and `getRegisteredProviderConfig()` are sufficient to mirror extension registrations without private runtime access.
- One lazily created child `ModelRuntime` can be shared and synchronized serially even when synchronization requests overlap.
- Native provider objects can be registered directly; effective legacy provider configs can be re-registered in the child runtime.
- Synchronization must reset each old child registration before re-registering it because legacy `registerProvider()` updates intentionally merge defined fields.
- The public extension API has no provider-registration change event. Re-synchronize before each spawn/model-resolution boundary and remove registrations no longer present in the host set.
- OAuth callback definitions mirror safely, but stored credentials do not transfer with registration metadata. The child runtime needs its own supported credential-store policy; missing child auth leaves the model unavailable. Do not use secret-returning registry auth methods to copy credentials.
- Installed offline model metadata exposes each canonical GPT 5.6 tier ID under several providers, including `openai` and `openai-codex`. Automatic routing must prefer an available exact match on the main agent's provider, otherwise require a unique available provider or fail ambiguity.
- Display-name matches are diagnostic only. Missing models, missing auth, and ambiguity produce bounded errors containing provider/model identity only.
- Bounded mirror snapshots need only provider/model IDs and must omit URLs, headers, auth configuration, OAuth definitions, and other provider config.

Specification impact:

- No fixed product decision changed.
- Sections 10.3 and 10.4 now record per-boundary synchronization, reset-before-register semantics, credential-store separation, and provider disambiguation.

## `SA-012` Minimal ResourceLoader spike

**Status:** DONE

**Dependencies:** `SA-010`

Goal: construct child sessions with dynamic prompts and selected context but no discovered extensions/personas.

Tasks:

- [x] Compare a fully explicit `ResourceLoader` with `DefaultResourceLoader` overrides.
- [x] Ensure extension discovery is empty.
- [x] Ensure no agent-profile directory is read.
- [x] Ensure prompt templates/skills/themes are absent unless explicitly added later.
- [x] Decide how trusted project context files are loaded.
- [x] Verify the child cannot see the parent `sub_agents_*` tools.
- [x] Verify the dynamic system prompt and context composition order.
- [x] Add tests for trusted vs untrusted project context behavior using temporary files.

Acceptance criteria:

- [x] No executable project resource is loaded into a child.
- [x] Dynamic role/objective changes independently for each child.
- [x] Context inclusion policy is explicit and tested.

Artifacts:

- `agent/extensions/sub-agents/test/resource-loader-spike.test.mjs`

Validated public API findings:

- A fully explicit public `ResourceLoader` can use `createExtensionRuntime()` while returning empty extension, skill, prompt, and theme results, an explicit dynamic prompt, an empty append-prompt list, and only copied approved context files.
- `DefaultResourceLoader` with all five discovery categories disabled plus explicit prompt/context overrides produces the same visible resources. The production design nevertheless chooses the explicit loader because it avoids package/settings resource discovery machinery and can reject nonempty `extendResources()` calls fail-closed.
- Child custom/built-in tool exposure is independent of the parent. An explicit `tools` allowlist containing only `read` and the child-only `report_to_parent` tool excludes parent `sub_agents_*` tools even when executable-looking parent extension files exist in the workspace.
- Custom system prompts are composed by Pi in this order: dynamic child prompt, approved `<project_context>`, then current working directory. Untrusted context produces no project-context block.
- Production will copy candidate context from the parent turn's already loaded `systemPromptOptions.contextFiles` only when `ctx.isProjectTrusted()` is true. It will not rediscover context in the child or inspect agent-profile directories; a stale/missing/untrusted snapshot means no project context.

Specification impact:

- No fixed product decision changed.
- Section 10.2 now makes the explicit loader and parent-snapshot trust policy normative.

## `SA-013` Guarded built-in tool compatibility spike

**Status:** DONE

**Dependencies:** `SA-010`

Goal: verify built-in edit/write/bash tools can be wrapped without breaking schemas, details, rendering assumptions, cancellation, or mutation queues.

Tasks:

- [x] Inspect public tool factory signatures and result types.
- [x] Wrap `edit` while preserving exact result/details shape.
- [x] Wrap `write` while preserving exact result/details shape.
- [x] Wrap `bash` with a pre-execution workspace lease callback.
- [x] Verify `AbortSignal` propagation.
- [x] Verify `withFileMutationQueue()` encloses the whole mutation window.
- [x] Verify leading `@`, cwd, existing symlink, and new-file path behavior.
- [x] Decide whether wrappers spread tool definitions or supply custom operations.

Acceptance criteria:

- [x] Built-in result renderers remain compatible where reused.
- [x] Tests prove the lease check happens before mutation.
- [x] No mutation occurs after a rejected claim.

Artifacts:

- `agent/extensions/sub-agents/test/guarded-tools-spike.test.mjs`

Validated public API findings:

- Use public `createEditToolDefinition()`, `createWriteToolDefinition()`, and `createBashToolDefinition()`, spread each definition, and override only `execute()` for lease acquisition. This preserves schemas, `prepareArguments`, prompt metadata, renderer references, and exact result/detail contracts.
- Claim the canonical file or workspace before delegating. A rejected claim prevents edit access/read/write, write mkdir/write, and bash exec operations from starting.
- Pass the original `AbortSignal` and `onUpdate` through unchanged. Built-in edit/write definitions check abort state before and after awaited operations; bash passes the signal to its operations backend and translates abort/timeout failures.
- Built-in edit/write definitions already call `withFileMutationQueue()` around the full mutation window. Existing target and symlink aliases serialize under one queue key; new files use their resolved absolute path. A second outer mutation queue is unnecessary and could deadlock.
- The wrapper strips a leading `@`, resolves relative to child cwd, uses `realpath()` for existing targets, and falls back to the absolute path for a missing target. Phase 5 must still prevent a claim-to-delegation symlink race and reconcile new-file identity after creation.
- Custom operations are test seams only. Production wrappers delegate to the standard local operations after the pre-execution lease check.

Specification impact:

- No fixed product decision changed.
- Section 13.5 now records the definition-spread wrapper and built-in queue boundary.

## `SA-014` Background parent-notification spike

**Status:** DONE

**Dependencies:** `SA-010`

Goal: prove a background child completion can notify the parent safely without triggering loops or one turn per token/event.

Tasks:

- [x] Create a bounded internal event inbox.
- [x] Coalesce multiple simulated child completions.
- [x] Test parent idle delivery.
- [x] Test parent streaming delivery using safe `deliverAs` behavior.
- [x] Ensure extension-origin messages are not reinterpreted as user requests.
- [x] Ensure one flush timer exists at a time and is cleaned up.
- [x] Decide exact notification policy for idle, blocked, and failed states.

Acceptance criteria:

- [x] Ten near-simultaneous completion events create one parent message batch.
- [x] No recursive notification loop.
- [x] Timers are cleared on session shutdown.

Artifacts:

- `agent/extensions/sub-agents/test/notification-spike.test.mjs`

Validated public API findings:

- Important child batches can always use `pi.sendMessage(..., { deliverAs: "followUp", triggerTurn: true })`. While the parent streams this queues one non-steering follow-up; while idle it starts one model turn.
- Ten near-simultaneous completions become one `customType: "sub-agents-event"` message and one provider continuation. Child progress does not enter the parent inbox.
- The inbox is bounded, sanitizes event fields, retains one flush timer, marks message details with the extension source/version, and clears pending state idempotently on shutdown.
- Notification loops are prevented structurally: only translated child-manager events call `enqueue`; parent custom messages and model responses are not re-enqueued.

Specification impact:

- No fixed product decision changed.
- Section 11.3 now makes follow-up-plus-trigger delivery normative.

## `SA-019` Phase 0 architecture review

**Status:** DONE

**Dependencies:** `SA-010`, `SA-011`, `SA-012`, `SA-013`, `SA-014`

- [x] Compare spike results with `SPEC.md`.
- [x] Update open questions and fixed implementation choices.
- [x] Decide test harness structure.
- [x] Confirm Phase 1 module layout.
- [x] Record validation commands and results.

Exit gate:

- [x] No core architecture depends on an unverified/private API.

Architecture review result:

- The implementation may proceed using only public SDK surfaces validated by offline tests: `createAgentSession`, in-memory managers, public model registration accessors/runtime APIs, explicit `ResourceLoader`, public built-in tool definitions, `withFileMutationQueue`, and `pi.sendMessage`.
- Continue using dependency-free `.mjs` Node test files plus `test/installed-packages.mjs` to load the active installed distribution. Production remains plain TypeScript with canonical installed imports and no package install.
- Confirmed Phase 1 starts with `index.ts`, `types.ts`, `manager.ts`, and focused offline state/lifecycle tests; runtime/model/resource/tool modules remain deferred to Phase 2/5 rather than entering the skeleton prematurely.

---

# Phase 1 — Extension Skeleton and State Model

## `SA-100` Create module skeleton

**Status:** DONE

- [x] Add `index.ts` factory with no background work during factory execution.
- [x] Add `types.ts`, `manager.ts`, and test scaffolding.
- [x] Use canonical installed imports.
- [x] Avoid adding a package/dependencies unless proven necessary.
- [x] Register lifecycle cleanup hooks.

## `SA-101` Define bounded core contracts

**Status:** DONE

- [x] Dynamic agent specification.
- [x] Agent ID and session generation types.
- [x] Lifecycle states.
- [x] Assignment record.
- [x] Bounded result/report/event types.
- [x] Usage ledger types.
- [x] Workspace identity and lease types.
- [x] Persisted historical snapshot version.

Acceptance criteria:

- [x] No contract includes runtime promises, credentials, SDK sessions, or unbounded raw histories.

## `SA-102` Implement lifecycle state machine

**Status:** DONE

- [x] Encode allowed transitions.
- [x] Reject stale-generation operations.
- [x] Make remove/abort/dispose idempotent.
- [x] Track current assignment separately from persistent child identity.
- [x] Preserve terminal metadata after disposal.

## `SA-103` Implement session-scoped manager registry

**Status:** DONE

- [x] Race-safe per-agent registry operations.
- [x] Atomic ID allocation.
- [x] Background promise tracking with immediate rejection handlers.
- [x] Subscription/timer/abort-controller ownership.
- [x] `disposeAll()` using all-settled cleanup.
- [x] No global concurrency semaphore.

## `SA-104` Wire Pi lifecycle invalidation

**Status:** DONE

- [x] `session_start` creates a fresh generation.
- [x] `session_shutdown` stops and disposes all children.
- [x] Reload/new/resume/fork cleanup.
- [x] Tree navigation/compaction policy according to spec.
- [x] Clear UI/status/timers.

## `SA-105` Basic `/sub-agents` command

**Status:** DONE

- [x] Display manager generation and counts.
- [x] Work without active children.
- [x] Guard TUI-only custom components with `ctx.mode === "tui"`.
- [x] No runtime actions beyond inspection in this phase.

Implementation note: Phase 1 uses only `ctx.ui.notify()` and does not create a custom TUI component; later dashboard work remains gated on `ctx.mode === "tui"`.

## `SA-109` Phase 1 validation

**Status:** DONE

- [x] State-transition tests pass.
- [x] Lifecycle cleanup tests pass.
- [x] No resource starts in extension factory.
- [x] Update backlog handoff.

---

# Phase 2 — Dynamic In-Process Runtime

## `SA-200` Shared child ModelRuntime adapter

**Status:** DONE

- [x] Lazy initialization.
- [x] Provider registration synchronization.
- [x] Inherit main model by provider/ID.
- [x] Explicit model resolution.
- [x] Canonical resolution of the Luna/Terra/Sol subscription models.
- [x] Nonsecret auth/model errors.
- [x] Clean lifecycle ownership.

Implementation notes:

- `ChildModelRuntimeAdapter` serializes synchronization and resolution boundaries, creates the shared runtime only on first use, and retries a failed initialization without exposing its underlying error.
- The default runtime uses Pi's supported `ModelRuntime.create({ allowModelNetwork: false })` credential/model policy. Production code never asks `ModelRegistry` for secret-bearing auth values; offline tests inject an in-memory runtime.
- Every synchronization resets and re-registers the exact current host registration, removes stale providers, then performs a network-disabled refresh so availability checks observe the new state.
- Exact explicit/inherited model resolution requires child-runtime availability. Canonical tier resolution prefers an available exact ID on the parent provider, accepts one unique available alternative, and rejects remaining ambiguity with bounded provider/model metadata only.
- The session manager owns the adapter and disposes it only after all child cleanup attempts settle. Adapter disposal is idempotent and does not initialize an unused runtime.

Artifacts:

- `agent/extensions/sub-agents/model-runtime.ts`
- `agent/extensions/sub-agents/test/model-runtime.test.mjs`

## `SA-201` Dynamic child prompt builder

**Status:** DONE

- [x] Common invariant protocol.
- [x] Dynamic role/objective/instructions/context.
- [x] Result instructions.
- [x] Child identity.
- [x] Bounds and escaping.
- [x] Confirm no predefined persona text.

Implementation notes:

- `buildSubAgentSystemPrompt()` emits one extension-owned invariant protocol and a deterministic `pi.sub-agent.assignment/v1` JSON envelope containing only the generated ID/name plus the dynamic role, objective, instructions, context, and result instructions.
- Dynamic values keep the core character bounds. JSON encoding plus explicit escaping for markup-significant characters and Unicode line separators preserves parsed text while preventing it from breaking the assignment envelope.
- The complete UTF-8 prompt fails closed above 128 KiB rather than truncating instructions. The protocol explicitly defers capability authority to exposed/guarded tools and supplies a final-response fallback until `report_to_parent` is available.
- Focused tests cover complete/minimal prompts, exact parsed field preservation, delimiter injection, predefined-persona absence, per-field limits, opaque-ID limits, and the aggregate byte cap.

Artifacts:

- `agent/extensions/sub-agents/prompt-builder.ts`
- `agent/extensions/sub-agents/test/prompt-builder.test.mjs`

## `SA-202` Minimal child resource loader

**Status:** DONE

- [x] Empty extensions/skills/prompts/themes.
- [x] Approved context files only.
- [x] Dynamic system prompt.
- [x] No recursive `sub-agents` exposure.

Implementation notes:

- `createSubAgentResourceLoader()` builds the dynamic system prompt through `buildSubAgentSystemPrompt()`, owns one fresh empty `createExtensionRuntime()` per child loader, exposes no extensions/skills/prompts/themes/append prompts, and rejects every nonempty `extendResources()` request.
- The parent extension captures a copied immutable `ParentContextSnapshotV1` from the current `before_agent_start.systemPromptOptions.contextFiles`. The manager owns it for its exact session generation and clears it before replacement, rejection, or disposal.
- Untrusted, missing, and stale-generation snapshots yield no child project context. Current-generation malformed snapshots fail closed; a rejected replacement cannot leave older trusted context active.
- Trusted context preserves exact path/content values without rereading the filesystem and is bounded to 64 files, 4,096 path characters, 256 KiB per file, and 1 MiB aggregate UTF-8 path/content bytes.
- Production integration tests prove the explicit loader composes the child prompt, approved `<project_context>`, and child cwd in order while a project-local extension attempting to register `sub_agents_spawn` remains undiscovered.

Artifacts:

- `agent/extensions/sub-agents/resource-loader.ts`
- `agent/extensions/sub-agents/test/resource-loader.test.mjs`

## `SA-203` Child session factory

**Status:** DONE

- [x] `SessionManager.inMemory(cwd)`.
- [x] `SettingsManager.inMemory()`.
- [x] Selected model/thinking level.
- [x] Read-only guarded tools.
- [x] Event subscriptions.
- [x] Dispose on partial initialization failure.

Implementation notes:

- `createSubAgentSession()` accepts one already resolved child model/runtime, creates an in-memory transcript and settings manager, attaches the explicit isolated resource loader, passes an exact read-only tool allowlist, validates the resulting public `AgentSession` contract, and subscribes the required child event listener before returning.
- Omitted tools default to `read`, `grep`, `find`, and `ls`; explicit subsets, including an empty set, are supported. `edit`, `write`, `bash`, write scopes, workspace-exclusive bash, and worktree mode fail closed until their later safety phases.
- The effective shared child cwd is realpath-canonicalized, must be an existing directory, and must remain beneath the realpath-canonical parent cwd. Existing symlink escapes and `..` escapes are rejected before session construction.
- `SubAgentSessionRuntime` exposes idempotent abort/wait/dispose/close ownership. Any failure after `AgentSession` creation attempts unsubscribe, abort, idle settlement, and disposal, while the authoritative factory error omits underlying runtime details.
- Offline production tests cover exact model/runtime/manager/resource ownership, thinking state, tool isolation, trusted context, event delivery, canonical workspace containment, mutator rejection, and cleanup after subscription or creation failure.

Artifacts:

- `agent/extensions/sub-agents/agent-runtime.ts`
- `agent/extensions/sub-agents/test/agent-runtime.test.mjs`

## `SA-204` Child event translator

**Status:** DONE

- [x] Streaming preview.
- [x] Active tool summary.
- [x] Bounded event timeline.
- [x] Turn/usage accumulation.
- [x] Settled-to-idle transition.
- [x] Failure/blocker transition.
- [x] No raw thinking or token deltas persisted.

Implementation notes:

- `ChildEventTranslator` consumes the public `AgentSessionEvent` union through one synchronous listener and immediately reduces every event to bounded nonsecret primitives before serial manager updates. Streaming text is coalesced into one 2,000-character transient tail preview; thinking blocks, raw deltas, tool arguments, partial tool results, retry error text, and full child event objects are never stored.
- Runtime activity records a bounded phase, aggregate active-tool count, at most 32 tool ID/name/timestamp summaries, and only the pending queue count. It is explicitly absent from the persisted history contract and is cleared on idle, blocked, failed, removed, and cleanup paths.
- Tool start/end, turn, compaction, and retry milestones enter the existing 100-record bounded timeline. Tool failures are observable but do not fail the assignment automatically; explicit blockers use `recordBlocker()` and final model `error`/`aborted` outcomes transition only after `agent_settled`.
- Assistant and nested tool usage is accumulated once at `turn_end`; compaction usage is added at `compaction_end`. A successful retry replaces the earlier terminal failure before settled-to-idle translation.
- Listener work owns a serialized, rejection-observed tail and exposes `flush()`/`close()` boundaries for the upcoming assignment runner. High-volume preview/activity updates are coalesced rather than creating an unbounded token-event queue.

Artifacts:

- `agent/extensions/sub-agents/event-translator.ts`
- `agent/extensions/sub-agents/test/event-translator.test.mjs`

## `SA-205` Persistent child assignment runner

**Status:** DONE

- [x] Launch initial prompt in background.
- [x] Prompt idle child again.
- [x] Steer/follow up running child.
- [x] Assignment IDs and result boundaries.
- [x] Abort race handling.

Implementation notes:

- `SubAgentAssignmentRunner` creates the normalized manager record first, accepts one internal model resolver boundary for later routing policy, initializes the isolated child session/event translator, registers manager-owned cleanup, starts the assignment, and returns after `AgentSession.prompt()` preflight accepts rather than waiting for completion.
- Every prompt completion is attached immediately to `manager.trackBackground()`. Prompt/preflight failures are reduced to bounded runner errors before manager state, while terminal model outcomes continue through the child event translator.
- New prompts require an initialized creating/idle child and create a fresh assignment ID. Steering/follow-up messages require a genuinely streaming child and remain within the existing assignment boundary.
- Per-child runner operations serialize only lifecycle/control races; child model runs remain concurrent across IDs with no global semaphore or count gate.
- Waiting synchronizes both the tracked prompt and translator queue. Assignment abort is idempotent at settled boundaries and races safely with manager removal; manager cleanup remains the authoritative abort/wait/dispose owner.

Artifacts:

- `agent/extensions/sub-agents/assignment-runner.ts`
- `agent/extensions/sub-agents/test/assignment-runner.test.mjs`

## `SA-206` Usage ledger

**Status:** DONE

- [x] Per-child totals.
- [x] Per-assignment totals.
- [x] Unreported delta.
- [x] Atomic drain.
- [x] No double counting under concurrent management calls.

Implementation notes:

- `usage-ledger.ts` owns immutable creation, cloning, assignment attribution, unreported-delta, and drain operations. Token/turn counters require non-negative safe integers, cost requires a finite non-negative number, and aggregate overflow fails before any manager record is changed.
- Every assignment record starts with its own empty usage totals. Child totals and assignment totals advance together for each translated turn/compaction delta, while aggregate child totals continue across later reusable assignments.
- `SubAgentManager.drainUsage()` runs inside the existing per-agent operation queue. It returns the exact child-total-minus-reported watermark and advances that watermark in one operation; repeated or concurrent drains return zero until later usage accrues.
- Focused tests cover helper immutability, invalid-delta atomicity, safe-integer overflow, per-assignment attribution, aggregate reuse, 64 concurrent updates, 16 concurrent drains, and post-drain accrual without loss or duplicate reporting.

Artifacts:

- `agent/extensions/sub-agents/usage-ledger.ts`
- `agent/extensions/sub-agents/test/usage-ledger.test.mjs`

## `SA-207` Complexity model router

**Status:** DONE

- [x] Add `auto`, `inherit`, and explicit model policies.
- [x] Add `simple`, `moderate`, and `complex` assignment tiers.
- [x] Route simple → `gpt-5.6-luna`.
- [x] Route moderate → `gpt-5.6-terra`.
- [x] Route complex → `gpt-5.6-sol`.
- [x] Implement documented deterministic fallback order.
- [x] Do not make a model call to classify complexity.
- [x] Default omitted complexity conservatively to moderate/Terra.
- [x] Record requested tier, selected provider/ID, fallback path, and nonsecret reason.
- [x] Add main-tool prompt guidelines explaining when to use each tier.
- [x] Test explicit override and ambiguous/missing model metadata.

Implementation notes:

- `SubAgentModelRouter` deterministically implements `auto`, `inherit`, and `explicit` over the session-generation-owned `ChildModelRuntimeAdapter`. It does not classify work with another model call.
- Automatic routing prefers the parent model's provider for each exact canonical tier ID, follows simple Luna → Terra → Sol → inherit, moderate Terra → Sol → Luna → inherit, and complex Sol → Terra → inherit, and never includes Luna in the complex fallback path.
- Missing/known-unavailable exact tier IDs advance the documented path. Ambiguous available exact IDs, provider mirroring failures, and availability-check failures fail closed instead of silently downgrading.
- Each success returns an immutable bounded `ModelRoute` with requested policy/complexity, selected provider/ID/tier, attempted fallback steps, fallback flag, and nonsecret reason. The manager defensively records it on the child and assignment boundary; the assignment runner accepts routed model results without changing lifecycle semantics.
- `SUB_AGENT_MODEL_ROUTING_PROMPT_GUIDELINES` is the canonical prompt metadata for the upcoming `sub_agents_spawn` registration; no parent prompt is injected before that control tool exists.

Artifacts:

- `agent/extensions/sub-agents/model-router.ts`
- `agent/extensions/sub-agents/test/model-router.test.mjs`

## `SA-209` Phase 2 validation

**Status:** DONE

- [x] Multiple read-only children overlap without numeric cap.
- [x] Dynamic prompts differ per child.
- [x] Simple/moderate/complex routes select Luna/Terra/Sol from fake registry metadata.
- [x] Missing preferred tiers follow the documented fallback order.
- [x] Child remains idle/reusable.
- [x] One failure does not affect siblings.
- [x] Offline only.

Implementation notes:

- The Phase 2 integration suite launches simple, moderate, and complex children concurrently through the production manager, router, assignment runner, session factory, prompt/resource loader, and event translator.
- A deterministic three-party fake-provider barrier proves all three requests overlap. Their isolated dynamic prompts differ, one synthetic model failure remains local, and a successful child accepts a second assignment with retained transcript and route metadata.
- The manager's existing 256-child state test and the production runtime's absence of a scheduler/count gate cover the no-fixed-cap invariant; provider or host backpressure remains natural rather than extension-imposed.

Artifact:

- `agent/extensions/sub-agents/test/phase2-integration.test.mjs`

---

# Phase 3 — Main-Agent Control Plane

## `SA-300` Public TypeBox schemas

**Status:** DONE

- [x] Strict `sub_agents_spawn` schema.
- [x] Strict `sub_agents_status` schema.
- [x] Strict `sub_agents_send` schema.
- [x] Strict `sub_agents_reconfigure` schema.
- [x] Strict `sub_agents_wait` schema.
- [x] Strict `sub_agents_remove` schema.
- [x] Add `auto`/`inherit`/explicit model policy and complexity fields.
- [x] Use `StringEnum` for string enums.
- [x] Bound names, prompts, arrays, tags, IDs, output detail levels, and timeouts.
- [x] Add `prepareArguments` only when a released compatibility need exists.

Implementation notes:

- `tools/schemas.ts` exports strict `additionalProperties: false` TypeBox schemas and inferred input types for all six Phase 3 tools plus the reusable dynamic-agent specification.
- Every string enum uses `StringEnum`; bounded arrays cover spawn batches, target sets, tools, tags, notifications, wait states, and write scopes. Opaque IDs, nested model/workspace objects, prompt fields, timeline detail, barrier timeouts, and graceful-stop timeouts have explicit limits.
- One spawn call accepts at most 64 specifications and one other control call targets at most 100 IDs/items. These are per-call input/result transport bounds, not active-pool limits: repeated spawn calls can keep adding children, and no scheduler, semaphore, or active-child count gate was introduced.
- Cross-field rules such as explicit-policy/model pairing, duplicate per-target object IDs, and selected/all removal consistency remain semantic executor checks because provider-facing schemas avoid conditional object unions. No released compatibility shape exists, so no `prepareArguments` shim was added.
- Status defaults to non-draining usage observation; `drainUsage: true` is the explicit future accounting boundary.

Artifacts:

- `agent/extensions/sub-agents/tools/schemas.ts`
- `agent/extensions/sub-agents/test/schemas.test.mjs`

## `SA-301` `sub_agents_spawn`

**Status:** DONE

- [x] Accept one or many dynamic specs.
- [x] Per-child validation/outcome.
- [x] Apply complexity-based model routing unless explicitly overridden.
- [x] Start all valid children without a count limit/semaphore.
- [x] Return IDs immediately after launch.
- [x] Handle partial initialization failure.
- [x] Compact/expanded renderer.

Implementation notes:

- `tools/spawn.ts` registers the strict schema with `executionMode: "parallel"`, activates the canonical complexity-routing guidance, and resolves every child through the session-generation manager, shared router, and persistent assignment runner.
- One mapped promise is created per request entry before the batch is awaited. Outcomes retain request order while child validation, routing, runtime initialization, and prompt launch remain independent; no active-count check, worker queue, semaphore, or scheduler was added.
- Each valid child returns its exact opaque ID after prompt preflight accepts. Known manager/runner failures become bounded per-child outcomes, unknown runtime errors are replaced with a generic message, and a failed child never rejects successful siblings.
- Model-visible content includes every started ID and compact route/failure metadata under UTF-8 display bounds. Structured details omit prompts and conversations, while compact and expanded `Text` renderers sanitize control characters and reuse the prior component.
- Offline tests prove whole-batch overlap with a deterministic barrier, lifecycle registration, inactive-generation cancellation, unknown-error redaction, renderer behavior, and production manager/router/runner partial success with a fake provider.

Artifacts:

- `agent/extensions/sub-agents/tools/spawn.ts`
- `agent/extensions/sub-agents/test/spawn.test.mjs`

## `SA-302` `sub_agents_status`

**Status:** DONE

- [x] All or selected IDs.
- [x] Compact default.
- [x] Bounded timeline detail.
- [x] Lease/model/usage/assignment state.
- [x] Optional explicit usage drain, default decided and documented.

Implementation notes:

- `tools/status.ts` registers a parallel compact/timeline inspection tool over the current session-generation manager. Omitted IDs select a live-first bounded all-agent view; explicit IDs preserve request order and return bounded per-target stale/unknown/removed-excluded outcomes without replacing them.
- Compact snapshots expose bounded identity/role/tags, lifecycle and elapsed time, current assignment, requested/selected model route, runtime/tool/queue state, leases, latest report/result, errors/blockers, and total/reported usage. Timeline mode adds only recent bounded milestones and never child message history.
- All-agent results cap transport at 100 records and report overflow. Structured details first preserve a minimal exact-ID plus bounded-name/state outcome for every returned record, then fit richer snapshots and round-robin timeline events under 48 KiB; model-visible content is independently capped under the same byte limit.
- Status is observational by default. `drainUsage: true` runs each selected manager drain on its atomic per-child queue, attaches the aggregate newly reported delta as Pi tool usage, and concurrent drains cannot double count.
- Unknown internal lookup text is replaced, manager lifecycle replacement clears the status runtime before disposal, and compact/expanded `Text` renderers reuse prior components.

Artifacts:

- `agent/extensions/sub-agents/tools/status.ts`
- `agent/extensions/sub-agents/test/status.test.mjs`

## `SA-303` `sub_agents_send`

**Status:** DONE

- [x] Per-target messages.
- [x] Idle `prompt()` path.
- [x] Running steer/follow-up path.
- [x] Missing/stale/removed target errors.
- [x] Per-target acceptance.

Implementation notes:

- `tools/send.ts` registers a parallel bounded per-target tool over the same production assignment runner created for `sub_agents_spawn`. Idle children start a new prompt assignment; running children receive `followUp` by default or an explicitly requested `steer` message.
- Every unique target dispatches independently and outcomes retain request order. If an ID occurs more than once in one call, all of its entries fail before runner dispatch so one batch cannot race two messages against one child while unrelated unique targets still proceed.
- Recognized pre-delivery assignment-boundary races synchronize and re-read manager state before a bounded retry. Unknown or potentially side-effecting failures are not retried, so the tool never guesses whether a rejected delivery took effect.
- Blocked, failed, stopping, removed, stale, and unknown targets return bounded per-target failures. Unknown internal errors are replaced, message text never appears in result content, structured details, or renderers, and the shared runner rejects active-message dispatch after manager closure.
- Offline tests cover concurrent idle/running delivery, duplicates, both settlement race directions, inactive/cancelled generations, unknown-error redaction, maximum transport bounds, lifecycle invalidation, and retained-context production runner reuse with a fake provider.

Artifacts:

- `agent/extensions/sub-agents/tools/send.ts`
- `agent/extensions/sub-agents/test/send.test.mjs`

## `SA-304` `sub_agents_wait`

**Status:** DONE

- [x] `any` and `all` conditions.
- [x] Selected IDs/all active.
- [x] Caller timeout and abort support.
- [x] Partial `onUpdate` status.
- [x] Bounded outputs.
- [x] Usage-delta drain.
- [x] Does not remove children.

Implementation notes:

- `tools/wait.ts` registers a parallel bounded barrier over a fixed call-start target set. Exact IDs preserve order and return per-target stale/unknown failures; omitted IDs capture the current live set once, cap it to the shared 100-record transport bound, and do not absorb later spawns.
- `any` and `all` evaluate only resolvable targets against the requested terminal states. An empty resolvable set returns `no_targets`, while caller deadlines return `timed_out` with the latest bounded snapshots rather than throwing or removing children.
- A bounded poll loop emits `onUpdate` only when lifecycle, assignment, active-tool, or queued-message state changes. Abort-aware timers clean up listeners; cancellation is honored before accounting begins.
- Final result/report/blocker/error metadata is UTF-8 bounded. Minimal exact-ID records are preserved for every returned target while richer details fit below 48 KiB, and compact/expanded renderers reuse the previous `Text` component.
- Every valid selected child is drained through the manager's atomic usage watermark when the barrier returns, including on timeout. Drains start only after a final cancellation check; once they start, the tool completes so advanced watermarks remain visible in the returned Pi usage. Concurrent/repeated management drains cannot double count.
- Offline tests cover any/all state changes, partial updates, timeout, abort-before-drain, empty/unknown selections, maximum output transport, lifecycle invalidation, error redaction, production in-process settlement, and repeated one-time usage accounting.

Artifacts:

- `agent/extensions/sub-agents/tools/wait.ts`
- `agent/extensions/sub-agents/test/wait.test.mjs`

## `SA-305` `sub_agents_remove`

**Status:** DONE

- [x] Graceful mode.
- [x] Forced abort mode.
- [x] Bounded grace period.
- [x] Unsubscribe/dispose/release.
- [x] Final output and usage delta.
- [x] Idempotent repeated removal.

Implementation notes:

- `tools/remove.ts` registers a parallel selected/all removal tool over the same production manager and assignment runner used by spawn/send. Graceful removal sends one fixed nonsecret steering instruction to a running child, waits only until the shared call deadline, and escalates creating, timed-out, request-failed, or caller-cancelled work to the manager's abort/wait/dispose cleanup path. Abort mode skips the graceful request.
- Exact selected IDs preserve per-target outcomes and support idempotent repeated removal of historical records. `scope=all` captures every currently live call-start child and removes all of them even when the active pool exceeds the 100-record result transport bound; bounded visible outcomes prioritize failures and report omissions.
- Once per-target cleanup begins, caller cancellation shortens graceful waiting but does not hide eventual disposal or usage accounting. Final result/report/error metadata is UTF-8 bounded, content and details independently remain below 48 KiB, unknown cleanup/request/drain errors are replaced, and graceful instruction text never enters tool results.
- Every successfully removed target atomically drains only newly accrued usage after manager cleanup. Concurrent/repeated drains share the manager watermark, already removed targets remain successful and return zero until new usage exists, and drain failures do not misreport cleanup failure.
- Manager cleanup clears timers/controllers/subscriptions, aborts and settles the child, disposes its session/translator, releases runtime state/leases, and leaves a bounded historical record. Lifecycle replacement clears the remove runtime before disposing the old manager.
- Offline tests cover graceful completion, immediate abort, timeout/cancellation escalation, partial and redacted failures, semantic selected/all validation, repeated idempotency, more-than-100 all-scope cleanup with bounded output, lifecycle invalidation, and production in-process session disposal.

Artifacts:

- `agent/extensions/sub-agents/tools/remove.ts`
- `agent/extensions/sub-agents/test/remove.test.mjs`

## `SA-306` `sub_agents_reconfigure`

**Status:** DONE

- [x] Switch an idle child with `session.setModel()` while retaining context.
- [x] Update thinking level through the supported SDK API.
- [x] Accept `auto`, `inherit`, or explicit model policy.
- [x] Queue a running child's change for its next safe assignment boundary.
- [x] Support explicit abort-and-switch without pretending the interrupted assignment completed.
- [x] Record old/new route and reason.
- [x] Support Luna → Terra → Sol escalation and later de-escalation.
- [x] Do not change workspace/tool capabilities in the first version.

Implementation notes:

- `tools/reconfigure.ts` registers the sixth parallel Phase 3 control tool over the current generation's manager, shared router, and persistent assignment runner. Every unique ID resolves and changes independently; duplicate IDs fail before routing or runtime effects, stale/unavailable states remain per-target failures, and unknown route/runtime text is replaced.
- Idle children change immediately through the installed public `AgentSession.setModel()` and `setThinkingLevel()` APIs. The session transcript remains in memory, SDK thinking-level clamping is recorded as the effective value, and the next assignment snapshots the new route while the completed assignment retains its original route.
- Running children default to an exact-assignment pending route in bounded manager state. The latest accepted queued request replaces an older unapplied request for that assignment, status exposes it as pending rather than active, new prompts fail closed until it applies, and the runner applies it only after translator settlement reaches reusable `idle`.
- `abort-and-switch` arms an intentional translator boundary before aborting. A genuinely aborted run becomes an `aborted` assignment with no fabricated result, returns the child to reusable `idle`, and only then applies the replacement. Removal/stopping wins races safely and clears pending state.
- Active route, effective thinking, pending route, model events, and assignment-boundary metadata are bounded and defensively copied. Model-visible content and details fit independently below 48 KiB; large results preserve every exact ID with compact old/new selected-model records and explicit truncation counters.
- Offline tests cover production idle context retention, queued replacement (including latest-wins semantics), SDK thinking clamping, intentional abort assignment semantics, lifecycle invalidation, duplicate and partial outcomes, unknown-error redaction, and maximum 100-target transport bounds.

Artifacts:

- `agent/extensions/sub-agents/tools/reconfigure.ts`
- `agent/extensions/sub-agents/test/reconfigure.test.mjs`

## `SA-307` Control-call race tests

**Status:** DONE

- [x] Spawn and immediate status.
- [x] Spawn and remove during initialization.
- [x] Send while child settles.
- [x] Two concurrent sends to one child.
- [x] Reconfigure idle child and retain context.
- [x] Reconfigure running child at the safe boundary.
- [x] Reconfigure/remove and reconfigure/abort races.
- [x] Wait and remove race.
- [x] Parent abort during wait.
- [x] Concurrent usage drains.

Implementation notes:

- `test/control-races.test.mjs` uses deterministic in-process child sessions, exact barriers, and the production manager/runner plus all six public control tools. It proves initialization removal, settlement redirection without duplicate delivery, unrelated-runtime stability, removal winning delayed and abort-and-switch reconfiguration races, wait/remove convergence, cancellation before drains, and atomic cross-tool usage accounting.
- Existing production tests in `send.test.mjs`, `reconfigure.test.mjs`, `status.test.mjs`, `wait.test.mjs`, and `usage-ledger.test.mjs` supply the retained-context, exact safe-boundary, concurrent-drain, and real in-process session coverage that complements the dedicated race matrix.

Artifacts:

- `agent/extensions/sub-agents/test/control-races.test.mjs`

## `SA-309` Phase 3 validation

**Status:** DONE

- [x] Main can evolve pool incrementally.
- [x] No operation rebuilds unrelated children.
- [x] Faster models handle simple tasks by default while stronger models remain available for escalation.
- [x] Tool outputs stay within Pi bounds.
- [x] No fixed concurrency count exists in code/config.

Validation notes:

- The complete spawn/status/send/reconfigure/wait/remove suite and the cross-control matrix exercise incremental creation, retained-context reuse, reconfiguration, barriers, removal, and unrelated-child stability.
- Deterministic router tests prove Luna/Terra/Sol defaults and explicit escalation/de-escalation; maximum-size fixtures keep every tool's model-visible content and structured details within their documented transport budgets.
- The manager accepts more than the control transport batch size, has no child-count gate, and a production-source scan found no semaphore, active-pool limit, or concurrency ceiling. Per-call schema bounds are transport limits, not live-pool limits.

---

# Phase 4 — Notifications and Observability

## `SA-400` Child `report_to_parent` tool

**Status:** DONE

- [x] Bounded schema.
- [x] Progress/blocker/result states.
- [x] Fallback to final assistant output.
- [x] Child-only registration.
- [x] Cannot control peers or manager.

Implementation notes:

- `tools/report-to-parent.ts` defines one strict `additionalProperties: false` schema with provider-compatible `StringEnum` states and the existing report summary/details/files/needs bounds. Its model-visible parameters contain no child ID, peer target, manager operation, callback, or executable routing field.
- Every production child receives exactly one custom `report_to_parent` tool in addition to its selected read-only built-ins. The assignment runner binds the tool to that child's exact translator through an in-memory closure; the parent Pi extension does not register this internal tool, and a missing handler fails session creation before runtime startup.
- Progress updates the manager's bounded current-assignment report only. Blocked reports retain summary/details/files/needs and explicitly move the assignment to `blocked` without guessing from tool errors. Result reports remain translator-owned for the exact active run and become the final bounded result only after successful settlement.
- A final assistant response remains the fallback when no result report exists. Starting another assignment clears stale manager report state, and each child `agent_start` clears the translator's prior structured result, so an older result can never override a later fallback.
- The child-facing acknowledgement contains only the controlled report state. Unknown manager/translator failures are replaced and never echo report content or internal error text.

Artifacts:

- `agent/extensions/sub-agents/tools/report-to-parent.ts`
- `agent/extensions/sub-agents/test/report-to-parent.test.mjs`

## `SA-401` Event inbox and coalescer

**Status:** NEXT

- [ ] Bounded queue/ring buffer.
- [ ] One flush timer.
- [ ] Batch by safe boundary/window.
- [ ] Deduplicate repeated state events.
- [ ] Cleanup on shutdown.

## `SA-402` Main-agent event delivery

**Status:** BLOCKED by `SA-401`

- [ ] Idle/running parent delivery policy.
- [ ] `customType: "sub-agents-event"`.
- [ ] Trigger only configured important events.
- [ ] Prevent extension-message loops.
- [ ] Bound summaries and event count.

## `SA-403` Persistent status widget

**Status:** READY

- [ ] Counts and aggregate usage.
- [ ] Bounded child rows.
- [ ] Running tool/blocker preview.
- [ ] Narrow-width behavior.
- [ ] Theme invalidation.
- [ ] Remove/clear lifecycle.

## `SA-404` Management tool renderers

**Status:** READY

- [ ] Compact call/result.
- [ ] Expanded detail.
- [ ] Partial wait updates.
- [ ] Reuse `lastComponent` when useful.
- [ ] Width-safe output.

## `SA-405` `/sub-agents` dashboard

**Status:** BLOCKED by `SA-403`

- [ ] Agent list and detail view.
- [ ] Bounded recent events.
- [ ] Human stop/remove action with confirmation.
- [ ] Manual message action.
- [ ] Usage and lease view.
- [ ] TUI-only guard/fallback.

## `SA-409` Phase 4 validation

**Status:** BLOCKED by `SA-401`–`SA-405`

- [ ] Completion storm coalesces.
- [ ] No token delta enters parent context.
- [ ] UI remains responsive under simulated high event volume.
- [ ] Theme/narrow terminal tests pass.

---

# Phase 5 — Shared-Workspace Mutation Safety

## `SA-500` Canonical workspace/path utilities

**Status:** READY

- [ ] Resolve cwd and trusted root.
- [ ] Strip leading `@`.
- [ ] Existing-path `realpath()` canonicalization.
- [ ] New-path absolute identity.
- [ ] Symlink alias handling.
- [ ] Write-scope validation.
- [ ] Reject traversal/out-of-root paths.
- [ ] Workspace identity type supporting future worktrees.

## `SA-501` File/workspace lease manager

**Status:** BLOCKED by `SA-500`

- [ ] File lease ownership.
- [ ] Workspace-exclusive ownership.
- [ ] Parent per-tool reservations.
- [ ] Atomic sorted multi-path claims.
- [ ] Non-blocking dynamic claims.
- [ ] Conflict metadata without sensitive content.
- [ ] Idempotent release.
- [ ] Generation invalidation.
- [ ] Invariant/assertion tests.

## `SA-502` Guarded child `edit`

**Status:** BLOCKED by `SA-501`, `SA-013`

- [ ] Validate scope/canonical path.
- [ ] Acquire/verify child lease.
- [ ] Run entire operation in `withFileMutationQueue()`.
- [ ] Preserve exact edit result/details.
- [ ] Update reported files/leases.
- [ ] Block cleanly on conflict.

## `SA-503` Guarded child `write`

**Status:** BLOCKED by `SA-501`, `SA-013`

- [ ] Same protections as edit.
- [ ] Correct new-file identity and post-create reconciliation.
- [ ] Preserve built-in result shape.

## `SA-504` Guarded child `bash`

**Status:** BLOCKED by `SA-501`, `SA-013`

- [ ] `disabled` policy.
- [ ] `workspace-exclusive` policy.
- [ ] Acquire full-assignment workspace lease before mutating bash use.
- [ ] Abort propagation.
- [ ] Document/reject detached process behavior as feasible.
- [ ] Preserve built-in bash details/truncation.

## `SA-505` Main-agent built-in mutation interception

**Status:** BLOCKED by `SA-501`

- [ ] `tool_call` handling for main edit/write/bash.
- [ ] Reserve per target/workspace before execution.
- [ ] Block with owner ID/name on conflict.
- [ ] `tool_result` and execution-end cleanup.
- [ ] Handle blocked/errored/aborted calls.
- [ ] Avoid stale reservation leaks.

## `SA-506` Lease blocker events and main controls

**Status:** BLOCKED by `SA-501`, Phase 4

- [ ] Child conflict moves to blocked.
- [ ] Coalesced parent event.
- [ ] Status/dashboard show ownership.
- [ ] Define explicit release behavior/API if remove is insufficient.
- [ ] Resume/redirect after resolution.

## `SA-507` Deterministic concurrency test suite

**Status:** BLOCKED by `SA-502`–`SA-506`

- [ ] Same file child-child conflict.
- [ ] Edit/write cross-conflict.
- [ ] Symlink alias conflict.
- [ ] New file conflict.
- [ ] Different files overlap successfully.
- [ ] Workspace bash blocks all child mutations.
- [ ] Child lease blocks main mutation.
- [ ] Main reservation blocks child claim.
- [ ] Abort/failure/shutdown release all ownership.
- [ ] Atomic multi-file claim avoids partial deadlock.

## `SA-509` Phase 5 validation

**Status:** BLOCKED by `SA-500`–`SA-507`

- [ ] Required same-file safety guarantee proven.
- [ ] Residual unknown-tool/external-process limitations documented.
- [ ] No claim is based solely on prompt compliance.

---

# Phase 6 — Persistence and Session Correctness

## `SA-600` Versioned historical snapshot schema

**Status:** BLOCKED by Phases 4–5

- [ ] `sub-agents-state-v1` shape.
- [ ] Strict bounds.
- [ ] No raw messages/runtime objects/auth.
- [ ] Persist dynamic role/objective summary, result, usage, files, timestamps.

## `SA-601` Append bounded state checkpoints

**Status:** BLOCKED by `SA-600`

- [ ] Meaningful state-change checkpoints only.
- [ ] Avoid one entry per streaming event.
- [ ] Persist removal/failure summaries.
- [ ] Persist unreported usage amount.

## `SA-602` Branch-aware restoration

**Status:** BLOCKED by `SA-601`

- [ ] Reconstruct from active branch.
- [ ] Respect compaction/tree semantics.
- [ ] Historical records only.
- [ ] Mark former live children terminated.
- [ ] Reject old active IDs.

## `SA-603` Lifecycle boundary matrix

**Status:** BLOCKED by `SA-602`

Test:

- [ ] reload;
- [ ] new;
- [ ] resume/switch;
- [ ] fork/clone;
- [ ] tree navigation;
- [ ] compaction/retry boundary according to finalized policy;
- [ ] quit/shutdown;
- [ ] partial cleanup failure.

## `SA-609` Phase 6 validation

**Status:** BLOCKED by `SA-600`–`SA-603`

- [ ] Historical view is branch-correct.
- [ ] No live runtime survives or is represented as live.
- [ ] No lease survives generation replacement.

---

# Phase 7 — Hardening and First Stable Release

## `SA-700` Output and state bounding audit

**Status:** BLOCKED by Phases 0–6

- [ ] Tool content under Pi byte/line limits.
- [ ] Details bounded.
- [ ] Event inbox bounded.
- [ ] Child previews bounded.
- [ ] Persisted snapshots bounded.
- [ ] Errors bounded and sanitized.

## `SA-701` Security/no-secret review

**Status:** BLOCKED by Phases 0–6

- [ ] No auth/config/header/env values in model-visible paths.
- [ ] No secret-bearing temp/log files.
- [ ] No inspection of prohibited project files.
- [ ] Child resource loader excludes arbitrary extensions.
- [ ] Dynamic prompt does not grant capabilities.
- [ ] Document same-process trust boundary.

## `SA-702` Cancellation/resource leak audit

**Status:** BLOCKED by Phases 0–6

- [ ] Abort every state.
- [ ] Dispose every partial initialization path.
- [ ] Remove subscriptions/timers/widgets.
- [ ] Release leases/reservations.
- [ ] No unhandled rejections.
- [ ] No post-shutdown callback mutates new generation.

## `SA-703` User-facing README

**Status:** BLOCKED by actual behavior

- [ ] Concept and dynamic-agent examples.
- [ ] Control tool reference.
- [ ] `/sub-agents` reference.
- [ ] Shared-workspace safety.
- [ ] Bash/worktree behavior.
- [ ] Luna/Terra/Sol routing, fallback, override, and reconfiguration examples.
- [ ] Usage accounting limitation.
- [ ] Trust/security limitations.
- [ ] Troubleshooting.

## `SA-704` Offline test command and fixtures

**Status:** BLOCKED by test layout

- [ ] One documented test command.
- [ ] Fake model/session/provider fixtures.
- [ ] Temporary workspace/git fixtures.
- [ ] No network/external services.
- [ ] No dependency install without approval.

## `SA-705` Manual TUI validation checklist

**Status:** BLOCKED by Phase 4

- [ ] Narrow/wide terminal.
- [ ] Expanded/collapsed tools.
- [ ] Theme change.
- [ ] Many active/idle agents.
- [ ] Completion storm.
- [ ] Human abort/remove.
- [ ] Non-TUI behavior.

## `SA-709` Stable shared-workspace release gate

**Status:** BLOCKED by `SA-700`–`SA-705`

- [ ] All first-release acceptance criteria in `SPEC.md` pass.
- [ ] Backlog and README match implementation.
- [ ] No known critical safety/lifecycle issue.
- [ ] User reviews behavior before any optional packaging/deployment work.

---

# Phase 8 — Git Worktree Isolation

## `SA-800` Worktree architecture decision record

**Status:** DEFERRED until shared-workspace release

- [ ] Decide one worktree per child vs reusable workspace groups.
- [ ] Ownership metadata location.
- [ ] Branch naming/collision policy.
- [ ] Cleanup and retention policy.
- [ ] Human/main-agent authorization boundaries.

## `SA-801` Temporary local-git test harness

**Status:** DEFERRED

- [ ] Create disposable local repositories only.
- [ ] Test branches/worktrees without network remotes.
- [ ] Verify cleanup never touches unowned worktrees.

## `SA-802` Worktree manager

**Status:** DEFERRED

- [ ] Create/identify extension-owned worktree.
- [ ] Scope workspace identity.
- [ ] Track branch/HEAD/dirty state.
- [ ] Preserve work on removal.
- [ ] Explicit cleanup.

## `SA-803` Worktree child runtime integration

**Status:** DEFERRED

- [ ] Child cwd/resource context points to worktree.
- [ ] Equivalent relative paths across worktrees do not conflict.
- [ ] Bash scoped to worktree.
- [ ] Status/dashboard show workspace.

## `SA-804` Commit/patch collection

**Status:** DEFERRED

- [ ] Bounded diff summary.
- [ ] Commit/patch metadata.
- [ ] No automatic merge.
- [ ] Conflict reporting.

## `SA-805` Explicit merge/cleanup flow

**Status:** DEFERRED

- [ ] Require explicit authorization.
- [ ] Unknown remote state/failure handling.
- [ ] Preserve recoverability.

## `SA-809` Worktree release gate

**Status:** DEFERRED

- [ ] Parallel equivalent-path writes proven isolated.
- [ ] No unowned worktree deletion.
- [ ] No implicit merge/push.

---

# Phase 9 — Future Ideas Requiring Evidence

Do not implement these merely because they are listed. Promote an item to a planned phase only after actual usage demonstrates value and the user approves the design.

## `SA-900` Selected context handoff between children

**Status:** DEFERRED

- Transfer bounded summaries/artifacts, not raw complete histories.

## `SA-901` Opt-in peer messaging

**Status:** DEFERRED

- Route through manager with visibility to main agent; avoid uncontrolled child chat loops.

## `SA-902` Pause/resume semantics

**Status:** DEFERRED

- Define meaning across model streams, tool calls, retries, and held leases.

## `SA-903` Read/write lease mode

**Status:** DEFERRED

- Prevent readers from seeing intermediate multi-file mutation state.

## `SA-904` Sandboxed read-only shell

**Status:** DEFERRED

- Requires enforceable OS/tool policy, not prompt or regex claims.

## `SA-905` Structured child result schemas

**Status:** DEFERRED

- Let the main agent supply bounded JSON schema while preserving fallback text.

## `SA-906` Resource-pressure recommendations

**Status:** DEFERRED

- Advisory only; must not become a fixed hidden concurrency ceiling.

---

# Open Questions

## `Q-001` How should host provider updates synchronize?

**Status:** Resolved by `SA-011`.

Synchronize the public registered-provider set before every spawn/model-resolution boundary. There is no public provider-registration event. Reset each previously mirrored registration before applying the host's current native provider or effective legacy config, and remove stale IDs. Never use private field access.

## `Q-002` Which project context files enter child sessions?

**Status:** Resolved by `SA-012`.

At each parent `before_agent_start`, capture the already loaded `systemPromptOptions.contextFiles` as bounded candidate context for that turn. Copy it into an explicit child loader only when `ctx.isProjectTrusted()` is true. Do not rediscover files in the child, and do not load extensions, prompts, skills, themes, system/append prompt files, or agent profiles. A stale, missing, or untrusted snapshot yields no child project context.

## `Q-003` Should idle children retain file leases?

**Status:** Proposed yes; finalize in Phase 5.

Reason: retained context often implies follow-up ownership. Cost: it may block unrelated writers. Dashboard and control tools must make this visible; an explicit release operation may be needed.

## `Q-004` Should status drain usage by default?

**Status:** Resolved by `SA-300`.

Status reports totals without draining by default. Its strict schema exposes `drainUsage: true` as an explicit atomic accounting boundary; wait/remove remain the primary default drains when their executors are implemented. This keeps repeated observation predictable.

## `Q-005` How should child completion wake the parent?

**Status:** Resolved by `SA-014`.

Coalesce configured idle/completion, blocked, and failed child events into one bounded `sub-agents-event` custom message and always deliver it with `{ deliverAs: "followUp", triggerTurn: true }`. This queues safely without steering while the parent is running and starts one turn when idle. Progress remains internal/TUI-only.

## `Q-006` Can guarded bash provide a strong no-detached-mutation guarantee?

**Status:** Open; investigate in `SA-013`/`SA-504`.

Until proven, shared-workspace bash remains workspace-exclusive and documented as a residual risk for deliberately detached processes.

## `Q-007` How are main-agent unknown custom mutators handled?

**Status:** Open limitation.

Possible future approach: event-bus lease protocol for cooperating extensions. Initial guarantee covers guarded children plus main built-in edit/write/bash interception.

## `Q-008` What are the exact provider and canonical IDs for the GPT 5.6 subscription tiers?

**Status:** Resolved as runtime provider selection by `SA-011`.

The canonical IDs are `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol`, but installed offline metadata exposes each ID under multiple providers, including `openai` and `openai-codex`. Therefore the provider is not a safe global constant. Automatic routing prefers the main agent's available provider for the exact ID, then a unique available exact-ID candidate; remaining ambiguity fails and requires an explicit provider/model choice.

The fixed routing semantics remain:

- simple → Luna;
- moderate → Terra;
- complex/high-stakes → Sol.

---

# Decision and Change Log

Append changes; do not rewrite history without reason.

## Initial design

- Replaced the earlier fleet-oriented concept with an evolving dynamic sub-agent pool.
- Removed all predefined agent/profile requirements.
- Selected in-process SDK sessions.
- Removed fixed task/concurrency counts.
- Elevated shared-file collision prevention to a first-release requirement.
- Deferred worktree isolation until after the shared-workspace implementation is stable.

## Model-tier routing addition

- Added complexity-aware subscription routing.
- `gpt-5.6-luna` is preferred for simple/fast assignments.
- `gpt-5.6-terra` is preferred for moderate assignments.
- `gpt-5.6-sol` is preferred for complex/high-stakes assignments.
- Added explicit model override and safe-boundary reconfiguration requirements.
- Kept the main agent responsible for classifying work; no predefined agents or extra classification model call was introduced.

## Provider mirroring and tier disambiguation

- Public `ModelRegistry` registration accessors are the provider-mirroring boundary; private runtime access remains prohibited.
- Re-synchronize registrations before each spawn/model-resolution boundary and reset before re-registering to avoid merged stale fields.
- Registration mirroring does not copy stored credentials; the child runtime owns credential resolution and fails unavailable models closed.
- Canonical GPT 5.6 tier IDs occur under multiple providers. Prefer the main model's available provider, accept a unique available alternative, and reject unresolved ambiguity.

## Explicit child resources and trusted parent context

- Production children use a fully explicit `ResourceLoader` with a fresh `createExtensionRuntime()` and no discovery categories.
- Candidate context is copied from the parent turn's `systemPromptOptions.contextFiles` only when the project is trusted; child sessions never rediscover context or inspect agent-profile directories.
- Parent extension tools and project executable resources are excluded by the empty extension result and an explicit child tool allowlist.

## Guarded built-in definition boundary

- Build guarded edit/write/bash tools from public `create*ToolDefinition()` results, preserving metadata/renderers and overriding only execution to claim before delegation.
- Built-in edit/write definitions own the full `withFileMutationQueue()` mutation window; do not add a second outer queue.
- Phase 5 must bind canonical lease identity to delegated execution and reconcile missing/new paths.

## Parent notification delivery

- Use one bounded coalescing inbox and one timer.
- Deliver important batches with `{ deliverAs: "followUp", triggerTurn: true }` for safe busy and idle behavior.
- Only child-manager translations enter the inbox; extension-origin parent messages never recursively enqueue.

## Phase 2/3 model-switch boundary clarification

- Phase 2 now exits after proving deterministic route selection, bounded route state, concurrent reusable children, and retained context.
- Applying a different model to an existing idle/running child remains the Phase 3 `sub_agents_reconfigure` control-plane responsibility (`SA-306`), where safe-boundary queueing and abort-and-switch semantics can be implemented and tested together.
- No fixed product decision changed.

## Control-plane transport bounds

- Public tool schemas reject unknown object properties at every level and use provider-compatible `StringEnum` definitions for all string choices.
- One spawn call is bounded to 64 specifications and one other control call to 100 target items/IDs so input and per-child outcome output remain bounded. These limits do not cap the live pool or serialize work; repeated calls may continue adding children with no active-count gate or semaphore.
- Cross-field constraints that would require conditional object unions remain fail-closed executor validation boundaries.
- Status usage observation is non-draining by default and becomes an accounting boundary only when `drainUsage: true` is explicitly supplied.
- No fixed product decision changed.

---

# Session Handoff Log

Append one entry at the end of every work session.

## Handoff 001 — Planning

**Completed:**

- `SA-001`
- Created the full specification and resumable backlog.

**Files created:**

- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`

**Validation:**

- Documentation-only change; no runtime tests were run.
- No network or external service access.
- No dependencies installed.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-010` — concurrent in-process `AgentSession` offline spike.

**Important constraints for next session:**

- Use fake model/session infrastructure only.
- Do not read `agent/auth.json` or `agent/sessions/**`.
- Do not restore `dynamic-fleet.ts` unless explicitly requested.

## Handoff 002 — Model-tier routing amendment

**Completed:**

- Extended `SA-001` documentation with complexity-aware model routing.
- Added `DEC-011`, `SA-207`, `SA-306`, `Q-008`, and related validation work.

**Files modified:**

- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`

**Routing decision:**

- simple/latency-sensitive → `gpt-5.6-luna`;
- moderate/balanced → `gpt-5.6-terra`;
- complex/high-stakes → `gpt-5.6-sol`.

**Validation:**

- Documentation-only amendment; no runtime tests were run.
- No provider contact, credential inspection, or dependency installation.

**Recommended next item:** `SA-010`, followed by the expanded `SA-011` registry/model identity spike.

## Handoff 003 — Concurrent AgentSession spike

**Completed:**

- `SA-010`
- Proved deterministic concurrent in-process sessions, transcript/tool-event isolation, sibling failure containment, settled-session reuse, and dispose-time disconnection.

**Files created:**

- `agent/extensions/sub-agents/test/agent-session-spike.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`

**Validation:**

- `node --test agent/extensions/sub-agents/test/agent-session-spike.test.mjs`
- Result: 1 test passed, 0 failed.
- The test used Pi's public faux provider with in-memory credentials/settings/sessions and disabled resource discovery.
- No network, live provider, external service, credential, existing session, or dependency installation was used.

**Key finding:**

- `AgentSession.dispose()` disconnects session listeners/persistence but does not destroy the low-level `Agent`; production cleanup must abort and await settlement before disposal.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-011` — host model/provider mirroring and canonical Luna/Terra/Sol identity spike.

## Handoff 004 — Host model/provider mirroring spike

**Completed:**

- `SA-011`
- Proved lazy public-API-only mirroring for native and legacy provider registrations.
- Recorded safe runtime provider disambiguation for Luna/Terra/Sol and OAuth/credential-store limits.

**Files created:**

- `agent/extensions/sub-agents/test/installed-packages.mjs`
- `agent/extensions/sub-agents/test/model-runtime-spike.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/test/agent-session-spike.test.mjs`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`

**Validation:**

- `node --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 2 tests passed, 0 failed.
- `git diff --check -- agent/extensions/sub-agents`
- Result: passed.
- Tests used only in-memory credential stores, fake providers, public registry/runtime APIs, and offline installed model metadata.
- No network, live provider, OAuth flow, external service, credential, existing session, or dependency installation was used.

**Key findings:**

- Re-synchronize registered providers before every spawn/model-resolution boundary; no public registration event exists.
- Reset each mirrored registration before re-registering to prevent stale merged fields.
- OAuth/provider definitions mirror, but credentials do not; child-runtime auth must use a supported credential-store policy and fail missing auth closed.
- Tier IDs are canonical but occur under multiple providers. Prefer the main model's available provider, then a unique available exact match, otherwise require explicit provider/model selection.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-012` — minimal child `ResourceLoader` and trusted-context isolation spike.

## Handoff 005 — Minimal child ResourceLoader spike

**Completed:**

- `SA-012`
- Proved fail-closed explicit child resource loading, trusted/untrusted context gating, dynamic prompt composition, and parent-tool exclusion.

**Files created:**

- `agent/extensions/sub-agents/test/resource-loader-spike.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`

**Validation:**

- `node --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 4 tests passed, 0 failed.
- `git diff --check -- agent/extensions/sub-agents`
- Result: passed.
- Tests used only temporary resource trees, in-memory settings/sessions/credentials, a fake provider, and public SDK APIs.
- No network, live provider, external service, credential, existing session, or dependency installation was used.

**Key findings:**

- A fully explicit `ResourceLoader` is the production choice; all-disabled `DefaultResourceLoader` overrides are equivalent at the visible API surface but retain unnecessary discovery machinery.
- Child context comes only from a fresh trusted parent-turn snapshot; missing, stale, or untrusted snapshots yield no project context.
- Explicit child tool allowlists prevent recursive visibility of parent `sub_agents_*` tools.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-013` — guarded built-in edit/write/bash compatibility spike.

## Handoff 006 — Guarded tools, notifications, and Phase 0 exit

**Completed:**

- `SA-013`
- `SA-014`
- `SA-019`
- Finished the Phase 0 technical-validation milestone and unlocked Phase 1.

**Files created:**

- `agent/extensions/sub-agents/test/guarded-tools-spike.test.mjs`
- `agent/extensions/sub-agents/test/notification-spike.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`

**Validation:**

- `node --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 8 tests passed, 0 failed.
- `git diff --check -- agent/extensions/sub-agents`
- Result: passed.
- Tests used temporary workspaces, custom in-memory filesystem/bash operations, in-memory settings/sessions/credentials, fake providers, and public SDK APIs only.
- No network, live provider, external service, credential, existing session, or dependency installation was used.

**Key findings:**

- Spread public built-in tool definitions and override only execution for pre-delegation lease claims; keep the built-in edit/write mutation queue as the sole per-file queue.
- Always deliver coalesced important parent notifications as `followUp` with `triggerTurn: true`; this is non-steering while busy and wakes once while idle.
- Every core Phase 0 architecture dependency now has an offline public-API proof. The remaining claim/delegation path race is explicitly deferred to the Phase 5 canonical lease implementation, not hidden.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-100` — create the Phase 1 extension/module skeleton and empty lifecycle cleanup path.

## Handoff 007 — Phase 1 extension skeleton and state model

**Completed:**

- `SA-100`
- `SA-101`
- `SA-102`
- `SA-103`
- `SA-104`
- `SA-105`
- `SA-109`
- Finished the Phase 1 milestone and unlocked Phase 2.

**Files created:**

- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/types.ts`
- `agent/extensions/sub-agents/manager.ts`
- `agent/extensions/sub-agents/test/manager.test.mjs`
- `agent/extensions/sub-agents/test/lifecycle.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 13 tests passed, 0 failed.
- `git diff --check --no-index /dev/null <each changed/new file>`
- Result: whitespace validation passed for all nine files.
- Tests used only deterministic in-memory manager state, fake lifecycle contexts, existing offline fake providers, and temporary files.
- No network, live provider, external service, credential, existing session, or dependency installation was used.

**Key implementation results:**

- Extension loading registers handlers/commands only; the manager is created on `session_start`.
- Successful compaction and tree navigation rotate to a fresh generation; shutdown disposes without replacement.
- The manager serializes operations per opaque child ID, bounds model-visible/history contracts, observes background rejections immediately, and performs idempotent all-settled cleanup.
- No child-count limit or concurrency semaphore was introduced.
- `/sub-agents` reports the current generation and lifecycle counts without enabling child model calls.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-200` — build the lazy shared child `ModelRuntime` adapter from the public provider-mirroring behavior proven in `SA-011`.

## Handoff 008 — Shared child ModelRuntime adapter

**Completed:**

- `SA-200`
- Implemented the lazy production child model-runtime owner, public provider mirroring, exact model resolution, bounded diagnostics, and manager lifecycle ownership.

**Files created:**

- `agent/extensions/sub-agents/model-runtime.ts`
- `agent/extensions/sub-agents/test/model-runtime.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/manager.ts`
- `agent/extensions/sub-agents/test/lifecycle.test.mjs`
- `agent/extensions/sub-agents/test/manager.test.mjs`
- `agent/extensions/sub-agents/test/installed-packages.mjs`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 17 tests passed, 0 failed.
- `git diff --check -- agent/extensions/sub-agents`
- Result: passed.
- Tests used only in-memory credential stores, fake providers/models, and public registry/runtime APIs.
- No network, live provider, external service, real credential, existing session, or dependency installation was used.

**Key implementation results:**

- Runtime creation is lazy, shared per parent-session manager generation, network-disabled at initialization, retryable after bounded initialization failure, and idempotently disposed after child cleanup.
- Host native and legacy provider registrations synchronize through public `ModelRegistry` accessors only; stale registrations are removed and reset-before-register prevents stale merged fields.
- Explicit and inherited models require exact provider/ID availability. Tier resolution uses canonical Luna/Terra/Sol IDs, prefers the parent provider, accepts only a unique alternative, and fails ambiguity closed.
- Model-visible errors and snapshots contain bounded provider/model identity only and never provider config, auth, headers, endpoints, or underlying credential errors.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-201` — implement the bounded dynamic child prompt builder and invariant protocol.

## Handoff 009 — Bounded dynamic child prompt builder

**Completed:**

- `SA-201`
- Implemented the extension-owned invariant protocol and structurally isolated dynamic assignment envelope.

**Files created:**

- `agent/extensions/sub-agents/prompt-builder.ts`
- `agent/extensions/sub-agents/test/prompt-builder.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/types.ts`
- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 20 tests passed, 0 failed.
- `git diff --check -- CLAUDE.md EXTENSIONS.md` plus per-file `git diff --check --no-index /dev/null <sub-agent file>` validation.
- Result: passed.
- Tests used deterministic strings and existing offline in-memory/fake SDK infrastructure only.
- No network, live provider, external service, real credential, existing session, or dependency installation was used.

**Key implementation results:**

- The prompt identifies each child by its generated ID/name and includes only task-specific role, objective, optional instructions/context, and result requirements; no predefined agent persona was added.
- Dynamic values are JSON encoded and escape envelope-significant characters while round-tripping exactly when parsed.
- Individual field/ID limits and a 128 KiB aggregate UTF-8 cap fail closed with bounded errors; instructions are never silently truncated.
- Protocol invariants cover scope/tool authority, no recursive delegation, report fallback, lease blockers, evidence-based completion claims, and bounded secret-free reporting.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-202` — implement the fully explicit isolated child `ResourceLoader` using the prompt builder and trusted parent context snapshots.

## Handoff 010 — Isolated child ResourceLoader

**Completed:**

- `SA-202`
- Implemented the production fail-closed child resource loader and generation-scoped trusted parent-context capture.

**Files created:**

- `agent/extensions/sub-agents/resource-loader.ts`
- `agent/extensions/sub-agents/test/resource-loader.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/types.ts`
- `agent/extensions/sub-agents/manager.ts`
- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/test/manager.test.mjs`
- `agent/extensions/sub-agents/test/lifecycle.test.mjs`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 25 tests passed, 0 failed.
- `git diff --check -- CLAUDE.md EXTENSIONS.md` plus per-file `git diff --check --no-index /dev/null <sub-agent file>` validation.
- Result: passed.
- Tests used only immutable fake context, temporary project files, in-memory settings/sessions/credentials, fake providers, and public SDK APIs.
- No network, live provider, external service, real credential, existing session, or dependency installation was used.

**Key implementation results:**

- Each child loader owns one fresh empty extension runtime and exposes no extensions, skills, prompts, themes, or append prompts; nonempty dynamic resource extension fails closed.
- The manager captures the parent turn's already loaded context only when the project is trusted, never rediscovers files, and invalidates snapshots across generation replacement, malformed replacement, and disposal.
- Missing, untrusted, or stale snapshots produce no child project context. Trusted copies preserve exact values under explicit file/path/per-file/aggregate UTF-8 bounds.
- A production fake-session integration test proves approved context composition and confirms a project-local recursive `sub_agents_spawn` registration remains undiscovered.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-203` — implement the child session factory with in-memory managers, resolved model/thinking state, explicit read-only tools, subscriptions, and partial-initialization cleanup.

## Handoff 011 — Read-only child session factory

**Completed:**

- `SA-203`
- Implemented the production in-process child session factory with strict read-only capability and workspace boundaries.

**Files created:**

- `agent/extensions/sub-agents/agent-runtime.ts`
- `agent/extensions/sub-agents/test/agent-runtime.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 28 tests passed, 0 failed.
- `git diff --check -- CLAUDE.md EXTENSIONS.md agent/extensions/sub-agents`
- Result: passed.
- Tests used only temporary workspaces, immutable fake context, in-memory settings/sessions/credentials, fake providers, and public SDK APIs.
- No network, live provider, external service, real credential, existing session, or dependency installation was used.

**Key implementation results:**

- Each child receives an exact resolved model/runtime, isolated `SessionManager.inMemory()` and `SettingsManager.inMemory()`, the explicit resource loader, and only its selected read-only built-ins.
- Default tools are `read`, `grep`, `find`, and `ls`; mutation-capable tools and policies remain disabled until the lease phase.
- Child cwd selection canonicalizes existing directories and rejects traversal or symlink escape beyond the parent workspace before any session starts.
- Required event subscription is established before success, and every partial post-creation failure performs best-effort unsubscribe/abort/wait/dispose with one bounded nonsecret error.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-204` — translate child `AgentSession` events into bounded previews, tool activity, usage, and lifecycle transitions.

## Handoff 012 — Bounded child event translator

**Completed:**

- `SA-204`
- Implemented bounded child event reduction, runtime observability, usage accumulation, and settled lifecycle translation.

**Files created:**

- `agent/extensions/sub-agents/event-translator.ts`
- `agent/extensions/sub-agents/test/event-translator.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/types.ts`
- `agent/extensions/sub-agents/manager.ts`
- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 31 tests passed, 0 failed.
- `git diff --check -- CLAUDE.md EXTENSIONS.md` plus per-file `git diff --no-index --check /dev/null <sub-agent file>` validation.
- Result: passed.
- Tests used only synthetic `AgentSessionEvent` records and the existing deterministic in-memory/fake SDK infrastructure.
- No network, live provider, external service, real credential, existing session, or dependency installation was used.

**Key implementation results:**

- Streaming text is coalesced into one bounded transient preview while thinking, raw deltas, tool arguments, partial outputs, and retry error text are discarded before manager operations.
- Active tool observability is bounded independently from the aggregate active count, and high-volume tool/event storms remain within the fixed activity and timeline bounds.
- Turn, nested tool, and compaction usage accumulates without counting streaming events; successful retries replace transient terminal failures.
- Final success transitions running children to reusable idle state, final model error/abort transitions to failed, and explicit blockers transition without inferring blockers from ordinary tool errors.
- Translator callbacks serialize and observe their own background failures and expose flush/close boundaries for assignment-runner cleanup.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-205` — connect model resolution, child session creation, event translation, and reusable background prompt/steer/follow-up assignment execution.

## Handoff 013 — Persistent child assignment runner

**Completed:**

- `SA-205`
- Implemented reusable background assignment launch, active message queueing, stable assignment boundaries, and abort/removal race handling.

**Files created:**

- `agent/extensions/sub-agents/assignment-runner.ts`
- `agent/extensions/sub-agents/test/assignment-runner.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 35 tests passed, 0 failed.
- `git diff --check -- CLAUDE.md EXTENSIONS.md` plus per-file whitespace checks for the untracked sub-agent tree.
- Result: passed.
- Tests used only temporary workspaces, in-memory settings/sessions/credentials, fake providers/models, synthetic rejected prompts, and public SDK APIs.
- No network, live provider, external service, real credential, existing session, or dependency installation was used.

**Key implementation results:**

- Initial creation returns after supported prompt preflight acceptance while completion remains tracked in the background with immediate rejection handling.
- Idle children retain their in-memory transcript and receive new assignment IDs; steering and follow-up messages stay inside the current running assignment.
- Prompt completion and event translation are synchronized before waits report a result, preventing stale running/idle boundaries.
- Abort/removal races settle through idempotent manager-owned cleanup without leaking the session, listener, translator, or runtime registry entry.
- No global scheduler, count ceiling, or concurrency semaphore was introduced.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-206` — extract atomic per-assignment and unreported-delta usage accounting from the manager ledger.

## Handoff 014 — Atomic usage ledger

**Completed:**

- `SA-206`
- Implemented immutable per-child/per-assignment usage accumulation and serialized one-time delta drains.

**Files created:**

- `agent/extensions/sub-agents/usage-ledger.ts`
- `agent/extensions/sub-agents/test/usage-ledger.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/types.ts`
- `agent/extensions/sub-agents/manager.ts`
- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 39 tests passed, 0 failed.
- Whitespace validation covered tracked documentation plus every untracked/modified sub-agent file.
- Result: passed.
- Tests used only deterministic in-memory manager state and the existing offline fake SDK infrastructure.
- No network, live provider, external service, real credential, existing session, or dependency installation was used.

**Key implementation results:**

- Child and current-assignment counters advance from one fully validated immutable update, so invalid/overflowing deltas cannot partially mutate manager state.
- Usage snapshots now expose the current assignment's token/cost/turn totals while retaining aggregate totals across reusable assignments.
- `drainUsage()` atomically advances the per-child reported watermark on the manager's per-agent queue; concurrent drains cannot double-report usage.
- Token and turn fields use safe-integer bounds, cost uses finite non-negative bounds, and snapshots remain defensive copies.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-207` — implement deterministic auto/inherit/explicit Luna/Terra/Sol model routing and documented fallback metadata.

## Handoff 015 — Complexity router and Phase 2 exit

**Completed:**

- `SA-207`
- `SA-209`
- Finished the Phase 2 dynamic in-process runtime milestone and unlocked Phase 3.

**Files created:**

- `agent/extensions/sub-agents/model-router.ts`
- `agent/extensions/sub-agents/test/model-router.test.mjs`
- `agent/extensions/sub-agents/test/phase2-integration.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/types.ts`
- `agent/extensions/sub-agents/manager.ts`
- `agent/extensions/sub-agents/assignment-runner.ts`
- `agent/extensions/sub-agents/test/manager.test.mjs`
- `agent/extensions/sub-agents/test/assignment-runner.test.mjs`
- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 43 tests passed, 0 failed.
- Whitespace validation covered tracked documentation and the complete untracked sub-agent tree.
- Result: passed.
- Tests used only temporary workspaces, in-memory settings/sessions/credentials, fake providers/models, and deterministic barriers.
- No network, live provider, external service, real credential, existing session, or dependency installation was used.

**Key implementation results:**

- Automatic simple/moderate/complex routing selects Luna/Terra/Sol by exact canonical ID, prefers the parent provider, follows the documented fallback order, and fails unresolved ambiguity closed.
- Explicit and inherited policies remain authoritative, while omitted policy/complexity defaults deterministically to auto/moderate.
- Every successful selection emits immutable bounded nonsecret route metadata, and the manager records a defensive copy on both the child and its assignment boundary.
- Three production-path child sessions overlap under a deterministic fake-provider barrier, retain isolated dynamic prompts, contain one sibling failure, and keep successful idle context reusable.
- No model classification call, global scheduler, count ceiling, or concurrency semaphore was introduced.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-300` — define the strict bounded public TypeBox schemas for the Phase 3 control plane.

## Handoff 016 — Phase 3 public control schemas

**Completed:**

- `SA-300`
- Began Phase 3 with strict bounded model-visible schemas for all six planned control tools.

**Files created:**

- `agent/extensions/sub-agents/tools/schemas.ts`
- `agent/extensions/sub-agents/test/schemas.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/types.ts`
- `agent/extensions/sub-agents/test/installed-packages.mjs`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 48 tests passed, 0 failed.
- Whitespace validation covered tracked documentation and the complete untracked sub-agent tree.
- Result: passed.
- Schema tests use the pinned installed TypeBox value checker through the existing offline installed-package harness.
- No network, live provider, external service, real credential, existing session, or dependency installation was used.

**Key implementation results:**

- Every public control object rejects unknown properties, every string choice uses `StringEnum`, and all names/prompts/tags/IDs/arrays/detail levels/timeouts are bounded.
- The dynamic spawn contract includes auto/inherit/explicit routing, simple/moderate/complex tiers, explicit model references, thinking level, child tools, workspace policy, result instructions, tags, and notification states.
- Per-call bounds (64 spawn specifications; 100 other target items/IDs) protect tool input/result size without imposing any active-pool count, worker semaphore, or concurrency scheduler.
- Status usage remains observational by default and drains only when `drainUsage: true` is explicitly requested.
- Conditional cross-field rules remain semantic checks for each executor rather than provider-facing conditional unions; no compatibility shim was added because no prior schema has been released.

**Pre-existing working-tree changes preserved:**

- deleted `agent/extensions/dynamic-fleet.ts`
- modified `agent/models-store.json`
- modified `agent/settings.json`

**Recommended next item:** `SA-301` — register and implement `sub_agents_spawn` using the new schema, production manager/router/runner, per-child outcomes, and no active-count gate.

## Handoff 017 — `sub_agents_spawn` control tool

**Completed:**

- `SA-301`
- Registered the first model-callable Phase 3 control tool and connected it to the production dynamic child runtime.

**Files created:**

- `agent/extensions/sub-agents/tools/spawn.ts`
- `agent/extensions/sub-agents/test/spawn.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/test/installed-packages.mjs`
- `agent/extensions/sub-agents/test/lifecycle.test.mjs`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 52 tests passed, 0 failed.
- `git diff --check -- agent/extensions/sub-agents`
- Result: passed.
- Tests used only fake providers, in-memory model/settings/session state, deterministic barriers, and temporary workspaces.
- No network, live provider, external service, real credential, existing Pi session, or dependency installation was used.

**Key implementation results:**

- `sub_agents_spawn` accepts a bounded batch, creates every per-child launch promise without an active-pool gate, and preserves request order only in its result—not execution.
- Automatic, inherited, and explicit routes run through the production router against the current parent registry/model. Successful prompt preflight returns the exact opaque child ID without awaiting completion.
- Semantic/model/runtime failures are isolated into bounded per-child outcomes; unknown internal error text is not exposed. One production-path test launches a valid child while an unavailable explicit-model sibling fails independently.
- The registered tool uses parallel execution mode, canonical routing prompt guidance, bounded model-visible output, and compact/expanded sanitized renderers.
- Session replacement clears the spawn runtime before disposing its manager, so stale calls fail through the manager generation rather than attaching to a replacement.

**Pre-existing working-tree changes preserved:**

- modified `agent/models-store.json`
- untracked unrelated `agent/extensions/bitwarden-secrets-manager/`

**Recommended next item:** `SA-302` — implement bounded `sub_agents_status` snapshots, selected/all lookup, timeline detail, and optional atomic usage draining.

## Handoff 018 — `sub_agents_status` control tool

**Completed:**

- `SA-302`
- Registered bounded current-generation child inspection and explicit atomic status-time usage accounting.

**Files created:**

- `agent/extensions/sub-agents/tools/status.ts`
- `agent/extensions/sub-agents/test/status.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/test/lifecycle.test.mjs`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 56 tests passed, 0 failed.
- `git diff --check -- CLAUDE.md EXTENSIONS.md agent/extensions/sub-agents` plus `git diff --no-index --check /dev/null` for the two new status files.
- Result: passed.
- Tests used deterministic manager state, synthetic bounded snapshots/timelines, fake providers already present in the suite, and temporary workspaces only.
- No network, live provider, external service, real credential, existing Pi session, or dependency installation was used.

**Key implementation results:**

- `sub_agents_status` returns compact selected/all snapshots by default and bounded recent timelines on request. Exact selected IDs preserve request order and produce per-target removed/stale/unknown outcomes.
- Compact state covers assignment, requested/selected route, thinking level, active tool and pending-message state, leases, report/result, blocker/error, elapsed time, and total/reported usage without exposing child conversations.
- All-agent views prefer live records, cap one result at 100 records, and preserve a minimal exact-ID plus bounded-name/state result for every returned child while fitting richer detail and timeline events under 48 KiB transport limits.
- Status does not drain by default. Explicit `drainUsage: true` attaches newly accrued child usage to the status tool result, and concurrent drains share the manager's atomic watermark without duplicate reporting.
- Session replacement invalidates the status runtime before manager disposal; unknown internal lookup errors are redacted; compact/expanded renderers reuse their `Text` component.

**Pre-existing working-tree changes preserved:**

- modified `agent/models-store.json`
- untracked unrelated `agent/extensions/bitwarden-secrets-manager/`

**Recommended next item:** `SA-303` — implement per-target `sub_agents_send` for idle prompts and running steer/follow-up delivery.

## Handoff 019 — `sub_agents_send` control tool

**Completed:**

- `SA-303`
- Registered bounded reusable-child message delivery for idle and running assignment states.

**Files created:**

- `agent/extensions/sub-agents/tools/send.ts`
- `agent/extensions/sub-agents/test/send.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/assignment-runner.ts`
- `agent/extensions/sub-agents/tools/spawn.ts`
- `agent/extensions/sub-agents/test/lifecycle.test.mjs`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 62 tests passed, 0 failed.
- Whitespace checks covered tracked documentation/source plus the two new send files.
- Result: passed.
- Tests used only fake providers, in-memory model/settings/session state, deterministic barriers, and temporary workspaces.
- No network, live provider, external service, real credential, existing Pi session, or dependency installation was used.

**Key implementation results:**

- `sub_agents_send` starts a new prompt on idle children and defaults to `followUp` for running children, with explicit `steer` available for immediate redirection.
- Unique targets dispatch independently and preserve request order only in outcomes. Every occurrence of a duplicate ID fails before dispatch while unrelated unique targets continue.
- Recognized pre-delivery settlement races synchronize and re-read state before a bounded retry; unknown or potentially side-effecting failures are never retried.
- Removed/stale/unknown and other non-messageable states produce per-target bounded errors. Unknown failures and all supplied message text are omitted from content, details, and renderers.
- Production wiring reuses the exact assignment runner created for spawn, invalidates send access on lifecycle replacement, and rejects active delivery after manager closure.

**Pre-existing working-tree changes preserved:**

- modified `agent/models-store.json`
- untracked unrelated `agent/extensions/bitwarden-secrets-manager/`

**Recommended next item:** `SA-304` — implement bounded `sub_agents_wait` barriers with partial updates, cancellation/timeout handling, result collection, and atomic usage draining.

## Handoff 020 — `sub_agents_wait` control tool

**Completed:**

- `SA-304`
- Registered bounded selected/current-live synchronization barriers with streamed state updates and atomic usage collection.

**Files created:**

- `agent/extensions/sub-agents/tools/wait.ts`
- `agent/extensions/sub-agents/test/wait.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/test/lifecycle.test.mjs`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --experimental-strip-types --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 68 tests passed, 0 failed.
- Whitespace checks covered tracked documentation/source plus the two new wait files.
- Result: passed.
- Tests used only fake providers, in-memory model/settings/session state, bounded synthetic snapshots, timers, and temporary workspaces.
- No network, live provider, external service, real credential, existing Pi session, or dependency installation was used.

**Key implementation results:**

- `sub_agents_wait` supports fixed-target `any`/`all` barriers for exact IDs or the bounded live set present at call start; later spawns do not silently join an existing barrier.
- Compact partial updates are emitted only for changed lifecycle/assignment/tool/queue state. Timeout returns current state, while caller abort cancels before usage drains and clears its polling timer/listener.
- Final result/report/blocker/error views preserve every exact ID under independent 48 KiB content/details bounds; unknown manager and usage-drain failures are redacted.
- Every valid selected child atomically drains only newly accrued usage when the wait returns, including timeout. Once drains start, the result completes so advanced watermarks are not hidden; repeated waits report zero until new usage accrues.
- Waiting never removes or replaces children, and lifecycle replacement clears the active wait runtime before old-manager disposal.

**Pre-existing working-tree changes preserved:**

- modified `agent/models-store.json`
- untracked unrelated `agent/extensions/bitwarden-secrets-manager/`

**Recommended next item:** `SA-305` — implement graceful/abort `sub_agents_remove` with bounded escalation, final output, usage draining, and idempotent cleanup.

## Handoff 021 — `sub_agents_remove` control tool

**Completed:**

- `SA-305`
- Registered bounded graceful/abort child disposal with final output and atomic usage collection.

**Files created:**

- `agent/extensions/sub-agents/tools/remove.ts`
- `agent/extensions/sub-agents/test/remove.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/test/lifecycle.test.mjs`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 73 tests passed, 0 failed.
- Whitespace checks covered tracked documentation/source plus the new remove files.
- Result: passed.
- Tests used only fake providers, in-memory model/settings/session state, bounded synthetic snapshots, timers, and temporary workspaces.
- No network, live provider, external service, real credential, existing Pi session, or dependency installation was used.

**Key implementation results:**

- `sub_agents_remove` supports exact selected IDs and every current live child, with independently concurrent per-target outcomes and no active-pool count gate. More-than-100 all-scope cleanup still acts on every call-start child while bounded visible details prioritize failures.
- Graceful mode queues one fixed steering request for a concise final boundary, waits only for the shared bounded deadline, then escalates active work to the manager's abort/wait/dispose path. Abort mode immediately enters cleanup.
- Caller cancellation fails before side effects, but after cleanup starts it only shortens graceful waiting; the tool completes so disposal and advanced usage watermarks remain visible.
- Final result/report/error views and all outcome/details text are bounded below 48 KiB with unknown internal request/removal/drain errors redacted. The fixed graceful instruction is never returned.
- Repeated exact-ID removal is successful and does not double-report usage. Production-path validation proves the manager cleanup removes the runner's live session and disposes the in-process child while retaining bounded historical output.
- Session replacement invalidates the remove runtime before old-manager disposal, and compact/expanded renderers reuse their `Text` component.

**Pre-existing working-tree changes preserved:**

- modified `agent/models-store.json`
- untracked unrelated `agent/extensions/bitwarden-secrets-manager/`

**Recommended next item:** `SA-306` — implement safe-boundary model/thinking reconfiguration with queued running changes and explicit abort-and-switch.

## Handoff 022 — `sub_agents_reconfigure` control tool

**Completed:**

- `SA-306`
- Registered safe-boundary model/thinking reconfiguration for idle and running reusable children.

**Files created:**

- `agent/extensions/sub-agents/tools/reconfigure.ts`
- `agent/extensions/sub-agents/test/reconfigure.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/types.ts`
- `agent/extensions/sub-agents/manager.ts`
- `agent/extensions/sub-agents/agent-runtime.ts`
- `agent/extensions/sub-agents/event-translator.ts`
- `agent/extensions/sub-agents/assignment-runner.ts`
- `agent/extensions/sub-agents/index.ts`
- `agent/extensions/sub-agents/tools/spawn.ts`
- `agent/extensions/sub-agents/tools/status.ts`
- `agent/extensions/sub-agents/tools/send.ts`
- `agent/extensions/sub-agents/tools/wait.ts`
- `agent/extensions/sub-agents/tools/remove.ts`
- `agent/extensions/sub-agents/test/status.test.mjs`
- `agent/extensions/sub-agents/test/lifecycle.test.mjs`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 79 tests passed, 0 failed.
- Installed-package jiti imports passed for the modified production entry point, manager, runtime, translator, runner, and reconfigure tool.
- Whitespace validation passed for the sub-agent tree and root extension documentation.
- Tests used only fake providers/models, in-memory model/settings/session state, deterministic barriers, bounded synthetic state, and temporary workspaces.
- No network, live provider, external service, real credential, existing Pi session, or dependency installation was used.

**Key implementation results:**

- Idle children switch models and SDK-clamped thinking levels immediately while retaining their isolated transcript.
- Running children default to an exact-assignment queued route; latest accepted queued configuration wins and applies only after reusable idle settlement.
- Explicit abort-and-switch records an interrupted assignment as aborted with no synthetic result before applying the replacement route.
- Manager snapshots/status now distinguish active and pending model routes and record effective thinking levels; prompt starts fail closed behind pending reconfiguration.
- Per-target results are independent, duplicate-safe, redacted, rendered compactly, lifecycle-invalidated, and bounded under 48 KiB for 100 exact IDs.

**Pre-existing working-tree changes preserved:**

- modified `agent/models-store.json`
- untracked unrelated `agent/extensions/bitwarden-secrets-manager/`
- unrelated changes under `../claude/`

**Recommended next item:** `SA-307` — add the dedicated cross-control race matrix for spawn/status/send/reconfigure/wait/remove interactions.

## Handoff 023 — Phase 3 race matrix and exit validation

**Completed:**

- `SA-307`
- `SA-309`
- Completed the Phase 3 main-agent control-plane milestone and unblocked Phase 4 and Phase 5.

**Files created:**

- `agent/extensions/sub-agents/test/control-races.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --test agent/extensions/sub-agents/test/control-races.test.mjs`
- Result: 6 tests passed, 0 failed; the deterministic race suite also passed 5/5 repeated runs.
- `node --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 85 tests passed, 0 failed.
- Installed-package jiti imports passed for the production manager, assignment runner, and all six control tools used by the new race suite.
- A production-source scan found no active-pool concurrency cap, semaphore, or worker limit; only bounded per-call transport metadata remains.
- `git diff --check -- agent/extensions/sub-agents CLAUDE.md EXTENSIONS.md`
- Tests used only deterministic fake sessions/providers, in-memory state, barriers, bounded synthetic data, and temporary workspaces. No network, live provider, external service, credential, existing Pi session, or dependency installation was used.

**Key validation results:**

- Creating children are immediately observable, and removal during initialization closes the late runtime without leaking manager or runner state.
- Concurrent sends serialize per child; a settlement boundary redirects only the later message into a fresh assignment without duplicate delivery.
- Idle reconfiguration retains the target child transcript/runtime and leaves unrelated children untouched.
- Removal wins delayed routing and in-flight abort-and-switch races without applying a replacement to a disposed child.
- Wait/remove races converge on removed state, parent cancellation stops before drains, and simultaneous cross-tool drains report each usage delta exactly once.
- The full Phase 3 suite validates incremental pool evolution, deterministic complexity routing, bounded output, and the absence of a fixed live-child concurrency gate.

**Pre-existing working-tree changes preserved:**

- modified `agent/models-store.json`
- untracked unrelated `agent/extensions/bitwarden-secrets-manager/`
- unrelated changes under `../claude/`

**Recommended next item:** `SA-400` — add the bounded child-only `report_to_parent` tool and fallback reporting boundary.

## Handoff 024 — Child `report_to_parent` boundary

**Completed:**

- `SA-400`
- Began Phase 4 with the bounded child-only structured reporting path.

**Files created:**

- `agent/extensions/sub-agents/tools/report-to-parent.ts`
- `agent/extensions/sub-agents/test/report-to-parent.test.mjs`

**Files modified:**

- `agent/extensions/sub-agents/types.ts`
- `agent/extensions/sub-agents/manager.ts`
- `agent/extensions/sub-agents/event-translator.ts`
- `agent/extensions/sub-agents/agent-runtime.ts`
- `agent/extensions/sub-agents/assignment-runner.ts`
- `agent/extensions/sub-agents/SPEC.md`
- `agent/extensions/sub-agents/BACKLOG.md`
- `CLAUDE.md`
- `EXTENSIONS.md`

**Validation:**

- `node --test agent/extensions/sub-agents/test/report-to-parent.test.mjs agent/extensions/sub-agents/test/event-translator.test.mjs agent/extensions/sub-agents/test/agent-runtime.test.mjs agent/extensions/sub-agents/test/assignment-runner.test.mjs`
- Result: 12 tests passed, 0 failed.
- `node --test agent/extensions/sub-agents/test/*.test.mjs`
- Result: 87 tests passed, 0 failed.
- Installed-package jiti imports passed for the new report tool and the production runtime, translator, runner, manager, and entry point.
- `git diff --check -- CLAUDE.md EXTENSIONS.md agent/extensions/sub-agents`
- Result: passed.
- Tests used only fake providers/models, in-memory managers, bounded synthetic reports, and temporary workspaces. No network, live provider, external service, credential, existing Pi session, or dependency installation was used.

**Key implementation results:**

- Every production child now receives one exact `report_to_parent` custom tool alongside its selected read-only built-ins; the parent control plane still exposes only the six Phase 3 management tools.
- The strict report schema supports progress, blocked, and result states with bounded summary/details/files/needs and no peer ID or manager-control field.
- Assignment-scoped result reports override successful final assistant text, while absent/progress-only reports use final assistant fallback. Retry and new-assignment boundaries clear stale structured results.
- Blocked reports retain their bounded metadata and explicitly transition the current assignment to `blocked`; ordinary tool errors still do not fabricate blockers.
- Child acknowledgements and unknown sink failures omit report bodies and private manager/runtime error text.

**Pre-existing working-tree changes preserved:**

- modified `agent/models-store.json`
- untracked unrelated `agent/extensions/bitwarden-secrets-manager/`
- unrelated changes under `../claude/`

**Recommended next item:** `SA-401` — implement the bounded event inbox, state-event deduplication, one coalescing timer, and lifecycle cleanup.
