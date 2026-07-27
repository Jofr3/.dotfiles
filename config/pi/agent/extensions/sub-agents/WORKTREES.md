# Git Worktree Architecture Decision Record

**Decision:** `SA-800`

**Status:** Accepted for Phase 8 implementation

**Date:** 2026-07-27

**Scope:** Normative Phase 8 architecture plus the completed `SA-801` disposable test harness and `SA-802` production manager/state/registry backend. Production worktree mode remains unavailable until child-runtime integration and the later release gate pass.

## 1. Context

The first stable release coordinates cooperating writers in one shared workspace. Git worktree mode must add filesystem isolation without weakening the existing child-session, cancellation, output-bounding, persistence, or authorization guarantees.

The public spawn schema already accepts `workspace.mode: "worktree"`, but the runtime deliberately rejects it. Enabling the mode is not a one-line change: current path resolution, lease authority, guarded tools, parent reservations, persistence, status, and lifecycle ownership all assume one canonical shared root.

Phase 8 must also account for Git-specific side effects:

- creating a linked worktree changes repository administration data and creates a branch;
- checkout may execute configured hooks or filter processes unless the Git runner constrains them;
- an interrupted Git command can leave a branch, worktree registration, directory, or metadata record in an uncertain combination;
- deleting a worktree or branch can destroy recoverable user work;
- a model request is not by itself informed operator approval for retained repository artifacts.

## 2. Decision summary

1. Use **one extension-owned worktree per child**. The same child reuses it across assignments; multi-child workspace groups are deferred.
2. Create every worktree from one recorded exact `HEAD` object ID in a clean, trusted, non-bare local repository.
3. Generate branch names, workspace IDs, and paths entirely inside the extension. No caller-supplied branch or filesystem destination is accepted in the first implementation.
4. Keep authoritative ownership metadata in an extension-controlled state root outside the source repository, Git common directory, and Pi agent configuration tree.
5. Lock each linked worktree after creation and retain the worktree and branch when the child becomes idle, fails, is removed, or the parent session ends.
6. Never merge, remove a linked worktree, delete a branch, prune worktrees, push, or contact a remote implicitly.
7. Require approval-capable UI confirmation for the exact worktree-capable spawn batch. Cleanup and merge are separate, explicitly confirmed operations.
8. Run only strict local Git command grammars through an exact reduced environment. Register the worktree with `--no-checkout`, then materialize the exact committed tree through non-filtering Git object reads and descriptor-bound Node filesystem operations; never invoke Git's checkout/smudge path.
9. Treat cancellation or timeout after a Git side-effect boundary as an uncertain outcome. Reconcile with read-only inspection, retain ownership metadata, and never blindly retry.
10. Add a versioned persisted workspace summary without exposing canonical repository/worktree paths. External ownership metadata, not session history, remains authoritative for cleanup.

## 3. Isolation unit

### Decision

Each worktree-mode child receives one unique branch and one unique linked worktree. That worktree remains bound to the child's opaque ID and is reused for every later assignment in the same live child runtime.

### Rationale

A reusable group shared by several children would reintroduce the same cross-child file and bash coordination problem as shared mode while also making branch ownership and cleanup ambiguous. One worktree per child gives:

- an unambiguous owner;
- independent equivalent relative paths;
- a stable retained context and filesystem across assignments;
- simple status, patch, and cleanup attribution;
- no need to infer which child owns uncommitted group changes.

There is still no numeric live-child or worktree concurrency ceiling. Per-call transport bounds and natural Git/provider/host backpressure remain distinct from pool limits.

### Deferred

Reusable workspace groups may be reconsidered only through a later decision record with an explicit group lease, attribution, and cleanup model.

## 4. Repository and base eligibility

Before approval and creation, the worktree provisioner must prove all of the following through strict local Git inspection:

- the parent `ctx.cwd` is inside an existing non-bare Git worktree;
- the repository top level and Git common directory canonicalize successfully;
- the logical parent workspace is the current Pi cwd, even when that cwd is a repository subdirectory;
- `HEAD` resolves to one full hexadecimal object ID;
- the parent worktree has no staged, unstaged, or non-ignored untracked changes;
- the project is trusted for the current Pi session;
- the repository does not require configured external checkout filters or other unsupported executable Git configuration;
- the selected external state/worktree root is outside the repository top level and Git common directory after canonicalization.

The clean-parent rule is intentionally conservative. A linked worktree starts from committed Git state and cannot include uncommitted parent changes safely or transparently. Phase 8 will fail with guidance instead of silently giving a child a stale partial view.

The base object ID is captured before confirmation and revalidated at the admitted creation boundary. The worktree branch is created from that exact object ID, never from a moving symbolic name.

## 5. Logical cwd and workspace identity

The physical linked worktree is rooted at the repository top level. The child's default logical cwd is the corresponding path inside that worktree:

```text
child cwd = linked worktree root + relative(repository root, parent ctx.cwd)
```

An optional existing `workspace.cwd` remains relative to that logical child root and must canonicalize beneath it. This preserves the released shared-mode meaning: children see the project rooted at the parent Pi cwd, not arbitrary repository siblings.

A resolved worktree identity contains at least:

```ts
interface ResolvedWorktreeIdentity {
  mode: "worktree";
  workspaceId: string;        // generated opaque ID
  root: string;               // canonical logical child root, internal only
  key: string;                // opaque workspace key, internal only
  branch: string;             // generated bounded ref name
  baseCommit: string;         // full validated object ID
}
```

Parent management-tool status, notifications, persisted Pi history, and normal extension logs omit `root`, Git common directory, metadata path, and ownership correlation token. The child model necessarily receives its absolute logical cwd through Pi's child system prompt, and approved bash can print or traverse parent/sibling/external paths. Child-authored reports may also repeat paths; no general secret detector can prevent that. The privacy guarantee is therefore limited to extension-generated parent-facing management surfaces, not the child transcript or approved shell output.

Every guarded non-bash tool must structurally deny the linked-worktree `.git` administrative file and any nested `.git` entry. Guarded edit/write may never replace or create Git administrative paths, even when the logical workspace root is the repository root.

Worktree keys are distinct from the shared parent key and from every sibling worktree key. Therefore:

- equivalent relative files in separate worktrees do not conflict;
- a worktree-scoped bash lease does not block the parent shared workspace or sibling worktrees;
- same-worktree guarded operations still use Pi's file mutation queue and sequential bash batches;
- parent built-in mutation interception continues to reserve only the parent shared workspace.

## 6. State root and ownership metadata

### State-root decision

Do not place linked worktrees or authoritative records under `getAgentDir()`. The Pi agent directory may itself be symlinked into the source repository, as it is in this runtime configuration.

Use a platform state location dedicated to this extension, with a versioned layout. On XDG systems the default is conceptually:

```text
${XDG_STATE_HOME:-~/.local/state}/pi/sub-agents/worktrees/v1/
  repositories/<repoKey>/
    records/<workspaceId>.json
    trees/<workspaceId>/
    empty-hooks/
```

Platform-specific state-directory selection must be isolated behind one helper. Worktree mode fails closed unless the platform implementation can enforce private state ownership. On POSIX, the canonical state root/repository directories require the current effective user and mode `0700`; strict record files require `0600`.

After symlink-free creation and canonicalization, the state root must be disjoint in both containment directions from each of:

- the repository top level;
- the Git common directory;
- the canonical Pi agent directory.

The source repository and Pi agent directory may contain one another independently; only the state root must be disjoint from each protected tree. Every parent component is lstat/revalidated without following an attacker-replaced final component. Record creation uses exclusive no-follow creation; replacement writes and fsyncs a same-directory temporary file, atomically renames it, fsyncs the directory, and revalidates owner/mode/type. A failure at any boundary preserves the prior authoritative record and fails closed.

### Repository and workspace IDs

- `repoKey` is a SHA-256 digest of the canonical Git common directory; it is not a path fragment derived from the repository title.
- `workspaceId` is a random opaque bounded identifier generated independently from child-controlled text.
- Neither repository names, child names, roles, objectives, nor tags participate in paths or refs.

### Authoritative record

Each workspace record is strict, versioned, atomically replaced, revisioned, and private. It contains only the fields needed to prove ownership and recover state, including:

- record version and lifecycle state (`allocating`, `ready`, `retained`, `cleanup-pending`, `uncertain`, `cleaned`);
- random correlation token and monotonic record revision;
- parent session generation and exact child ID;
- canonical repository top level and Git common directory;
- canonical physical worktree path and logical child root;
- generated workspace ID and branch ref;
- base and last-observed commit IDs;
- timestamps and bounded failure category.

Canonical paths remain absent from extension-generated parent management content/details, notifications, persisted Pi history, and normal logs. They are present in the private record and necessarily visible to the child model as cwd; approved bash can expose them. The correlation token is never model/UI/log visible and is not a standalone security credential.

### Destructive ownership proof

A branch prefix, directory name, or caller-supplied record is never sufficient ownership proof. The correlation token only detects accidental record mix-ups; because it is stored with the record, it does not authenticate a replaced record.

The actual authority is a strict record read from the protected state root plus exact Git/path/ref verification while holding the repository operation lock. Before cleanup the implementation must re-fetch and verify:

1. strict no-follow record provenance, owner/mode/type, revision, and state;
2. containment beneath the canonical extension state root in both directions required by the layout;
3. exact Git common-directory identity from inside the linked worktree;
4. an exact `git worktree list --porcelain -z` registration for the recorded path;
5. the exact canonical full branch ref, workspace ID, base/current object IDs, and child association;
6. current dirty/HEAD state and the requested cleanup preconditions.

A missing, malformed, mismatched, symlinked, concurrently revised, or ambiguous proof fails closed and preserves the artifact.

## 7. Branch and path policy

Branch and path names are generated, bounded, and validated before use.

Canonical stored branch-ref form:

```text
refs/heads/pi/sub-agents/<repoKey-prefix>/<workspaceId>
```

Rules:

- records, comparisons, status, and persistence always use the full `refs/heads/...` form;
- derive the short `pi/sub-agents/...` argument only after exact `refs/heads/` prefix validation;
- validate the short argument with `git check-ref-format --branch` and compare Git porcelain output only to the exact stored full ref;
- register with `git worktree add --no-checkout --lock --reason <bounded reason> -b <short-branch> <path> <exact-base-oid>`;
- never use `-B`, `--force`, a caller-controlled commit-ish, or an existing branch;
- let atomic Git ref/worktree creation arbitrate cross-process collisions;
- a proven pre-side-effect name collision may allocate a fresh ID;
- after an admitted or uncertain Git command, reconcile instead of retrying with another identity.

The final worktree path must not already exist. Its parent is extension-owned; the exact final directory is created by Git.

Every created worktree remains locked with a bounded extension reason while retained. The extension never invokes `git worktree prune`.

## 8. Admission and authorization

### Spawn

`workspace.mode: "worktree"` is explicit main-agent intent, not operator authorization.

Before any manager child ID, external record, branch, or worktree is created, spawn builds one immutable in-memory `WorktreeSpawnPlanV1`. The plan contains the manager generation, trusted-project decision, canonical repository/common-dir identity, exact base OID, parent cleanliness/config fingerprint, request indexes, normalized worktree specs, generated workspace IDs/full refs/paths, bash-capable indexes, and an expiry. A deterministic digest binds every field.

An approval-capable TUI/RPC interaction must show a bounded exact batch summary including:

- child names and objectives;
- number of branches/worktrees that will be created and retained;
- a bounded operator-only canonical repository display path (for example `~`-relative) and short base commit;
- whether the parent is clean;
- generated branch/workspace count;
- which children also request local bash;
- an explicit warning that approved bash can mutate the parent checkout, sibling worktrees, Git common metadata, network-visible resources, same-UID state, and arbitrary external paths despite the worktree label.

The operator-only repository path may cross the TUI/RPC approval protocol but is not copied into tool content/details, parent messages, or Pi history by this extension.

Approval stages a one-shot in-memory authorization for the exact plan digest. Provisioning must immediately reacquire the repository operation lock, re-inspect trust/base/status/config, compare the complete plan, and atomically consume that authorization before the first side effect. Any mismatch, expiry, denial, cancellation, missing approval UI, or failed project trust rejects the complete worktree-capable spawn batch and requires a new plan/approval.

Shared-only siblings may not start ahead of a required worktree/bash batch approval. After approval, every request entry retains the released independent per-child outcome contract: each valid child launches concurrently, while creation/runtime failures remain per child.

Old persisted tool calls remain safe because the schema already accepted `"worktree"` but runtime behavior changes from rejection to a newly confirmed side effect.

### Cleanup and merge

- `sub_agents_remove` stops/disposes the in-process child but retains its branch and linked worktree.
- `sub_agents_release` releases cooperative leases only; it does not alter Git artifacts.
- Worktree cleanup is a separate exact-ID/workspace-ID operation with explicit informed confirmation.
- Merge is a separate exact operation with explicit informed confirmation.
- No approval is inferred from child completion, idle state, removal, session shutdown, or a prior spawn confirmation.
- JSON/print modes fail closed for these consequential operations. RPC may proceed only through its approval protocol.

## 9. Git execution boundary

Production uses one injected, testable local Git operations layer. At extension session startup it resolves `git` through the fixed operational `PATH`, realpath-pins one regular executable, and invokes only that exact path with `shell: false`. Later `PATH` changes cannot retarget it.

Every Git process receives only this positive environment set when present: `PATH`, `PATHEXT`, `SystemRoot`, `WINDIR`, `COMSPEC`, `LANG`, `LC_ALL`, `LC_CTYPE`, `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `TMPDIR`, `TMP`, and `TEMP`. HOME/config/temp locations are extension-owned private directories. All ambient `GIT_*`, credential, askpass, SSH, proxy, pager, editor, object/alternate-object, namespace, template, exec-path, attributes, and config-count/parameter variables are dropped. The runner then sets only fixed values including:

- `GIT_CONFIG_NOSYSTEM=1`;
- `GIT_CONFIG_GLOBAL=<platform null file>`;
- `GIT_TERMINAL_PROMPT=0`;
- `GIT_NO_LAZY_FETCH=1`;
- `GIT_NO_REPLACE_OBJECTS=1`.

Every command prepends one fixed ordered config prefix whose only dynamic value is a verified extension-owned empty-hooks path:

- `core.hooksPath=<empty-hooks>`;
- `core.fsmonitor=false`;
- `core.autocrlf=false`;
- `commit.gpgsign=false` and `tag.gpgsign=false`;
- `protocol.file.allow=never`;
- `submodule.recurse=false`;
- pagers/editors/external diff disabled for the relevant inspection/mutation.

The typed argv grammar forbids all caller-supplied `-c`, config scope, alias, pager, editor, strategy, hook, filter, textconv, upload/receive-pack, force, prune, delete, remote-like, and URL values. Output, process lifetime, cancellation, and late rejection observation are bounded.

Repository inspection reads local config with includes disabled and rejects any include/includeIf directive, `filter.*.(clean|smudge|process|required)`, fsmonitor command, external diff/textconv, custom merge driver, partial-clone/promisor setting, sparse-checkout setting, or unsupported executable/config indirection. Failure to inspect every required scope fails closed.

### Non-executing materialization

The extension never asks Git to checkout files. It registers the branch/worktree with `git worktree add --no-checkout`, disables hooks anyway, populates the worktree-specific index through a strict non-checkout tree-read operation, and materializes the exact base tree itself:

1. stream and strictly parse `git ls-tree -rz --full-tree <exact-oid>`;
2. stream exact blob bytes through `git cat-file --batch` without `--filters` or `--textconv`;
3. create directories/files/symlinks through descriptor-bound no-follow Node operations beneath the empty worktree root;
4. preserve supported regular-file executable bits, leave gitlink entries uninitialized, and reject unknown modes, traversal, `.git`, case/normalization collisions, symlink-parent escapes, malformed framing, missing objects, or any unexpected preexisting entry;
5. verify the worktree-specific index, HEAD/full branch ref, complete materialized paths, and clean status under the same fixed config.

This intentionally yields repository blob content rather than smudged/LFS working content. Repositories requiring external filters are unsupported. A materialization failure is reconciled and retained/marked uncertain under the creation rules; Git checkout is not used as fallback.

The command layer exposes typed operations such as `inspectRepository`, `registerNoCheckoutWorktree`, `materializeTree`, `listWorktrees`, `inspectWorktree`, `collectSummary`, and `removeOwnedCleanWorktree`; it never exposes a generic production `runGit(args)` path.

## 10. Creation transaction and uncertainty

Creation is a recoverable state machine protected by two serialization layers:

- one process-local promise queue per canonical Git common directory;
- one cross-process repository lock directory created exclusively under the protected state root with a random owner value.

No Git mutation, ownership-record transition, cleanup verification, or merge verification occurs without both. A crashed/stale cross-process lock is never broken automatically; it becomes a bounded recovery condition requiring explicit human inspection. Each record update is compare-and-swap against its exact prior revision while the lock is held.

Batch ordering is:

1. inspect/validate and create the immutable in-memory batch plan with generated workspace identities;
2. receive and consume exact one-shot plan approval after complete revalidation;
3. allocate manager child IDs independently for admitted entries;
4. for each entry, acquire the repository locks and exclusively write its revision-1 `allocating` record;
5. run the one admitted no-checkout worktree registration command;
6. materialize the exact tree without Git checkout/filter execution;
7. inspect Git registration, full branch ref, path, HEAD, index, and cleanliness;
8. compare-and-swap the record to `ready` and publish the resolved workspace to child runtime construction.

After approval, entries may provision concurrently; the repository queue serializes only their short Git/record critical sections, not child model execution. Every request returns an independent `started`, `failed`, `cancelled-before-side-effect`, `retained-after-runtime-failure`, or `uncertain` outcome. Successful siblings are never rolled back because another entry fails.

Cancellation before step 4 creates no external record or Git artifact. Once step 4 begins, cancellation is observed but the exact per-child reconciliation/record result completes so the extension does not hide ownership state. After the Git command starts:

- if branch, registration, path, and record are all proven absent, the unused allocation record may be removed through an exact revision transition;
- if creation/materialization is proven complete, publish or retain it according to the caller boundary;
- if proof is incomplete, mark `uncertain`, retain every possible artifact, and block blind retry/cleanup.

An admitted or uncertain Git command is never retried under another identity. A later child model/session initialization failure preserves the successful workspace as `retained` and returns its bounded workspace ID/disposition; it does not silently delete it.

## 11. Runtime integration seams

Phase 8 implementation must introduce explicit workspace provisioning before `createSubAgentSession()` instead of hiding Git creation inside the session factory.

Recommended dependency order:

1. `test/git-fixtures.mjs` and `test/offline-guard.mjs` gain strict local worktree grammars (`SA-801`, complete).
2. Add `workspace/worktrees.ts` with repository inspection, external records, creation, reconciliation, and retained-state inspection (`SA-802`).
3. Generalize `workspace/paths.ts` from shared-only identity validation to registered shared/worktree identities.
4. Replace the manager's single-root `WorkspaceLeaseManager` assumption with a generation-owned workspace registry/coordinator map.
5. Make the assignment runner provision one resolved workspace after child ID allocation and before child session construction.
6. Change `createSubAgentSession()` to consume a pre-resolved workspace/cwd rather than resolve or create one itself.
7. Remap trusted in-repository context-file display paths to the equivalent worktree paths without rereading contents.
8. Update guarded read/edit/write/bash tools to operate on either registered identity while preserving current capability and output contracts.
9. Add bounded workspace summaries to status, dashboard, persistence, notifications, and exact retained-workspace controls.
10. Add a generation-independent bounded `WorktreeCatalog` over strict external records. It supports read-only list/inspect by exact workspace ID, correlates the historical child ID informationally, reports malformed/uncertain records without adopting them, and is the only source for later cleanup/merge selection.

Implementation ownership is mapped to the existing backlog: `SA-802` owns the strict Git/state/catalog manager and multi-workspace registry; `SA-803` owns spawn-plan approval, runtime/path/lease/context/tool integration; `SA-804` owns bounded commit/diff/status collection; `SA-805` owns V2 persistence, parent tools/dashboard/catalog UX, and separately confirmed cleanup/merge flows. `SA-809` owns final hardening and release validation.

The parent mutation interceptor remains intentionally attached only to the parent shared workspace.

## 12. Persistence and recovery

The strict `sub-agents-state-v1` payload cannot accept new fields. Phase 8 adds exact custom type `sub-agents-state-v2` with data `version: 2`; V1 remains byte/schema compatible.

`PersistedSubAgentHistoryV2` carries every bounded V1 identity/history field under the same limits and consistency rules—generation, child ID, name, role, objective summary, state/status/result, model route, usage, files/omissions, timestamps, and removal reason—plus one strict `workspace` object:

```ts
type PersistedWorkspaceSummaryV2 =
  | { mode: "shared" }
  | {
      mode: "worktree";
      workspaceId: string; // ^saw1-[A-Za-z0-9_-]+$, <= 200 chars
      branchRef: string;   // exact generated refs/heads/pi/sub-agents/..., <= 512 chars
      baseCommit: string;  // lowercase full 40- or 64-hex object ID
      disposition: "active" | "retained" | "cleaned" | "uncertain";
    };
```

Every nested object rejects unknown properties, the serialized record remains below 48 KiB, and workspace text has explicit character/UTF-8 bounds. A worktree child emits exactly one V2 checkpoint at every normal historical boundary and external disposition change; it never emits a paired V1 entry. Shared children may continue emitting V1 during migration.

Active-branch restoration scans recognized V1 and V2 entries newest-first and reduces by exact opaque child ID. The latest recognizable entry of either version wins; a malformed latest recognizable V1/V2 entry suppresses fallback to an older record for that ID. V2 worktree metadata is informational history only. V1 means shared history. No record from an abandoned branch participates.

Canonical repository/worktree/state paths, record revisions, lock/correlation values, and ownership metadata are never persisted in Pi history. Restored history never revives or adopts a worktree. The generation-independent external catalog is authoritative for later inspection/cleanup; session history can correlate an old child ID/workspace ID but cannot authorize destructive action.

The public `workspace.mode` schema shape does not change, so no `prepareArguments` compatibility shim is required for `sub_agents_spawn`. Descriptions and semantic validation must be updated.

## 13. Retention, cleanup, and merge

### Default retention

Idle children retain their worktree. Child failure, removal, Pi reload/new/resume/fork/tree/compaction, and process shutdown stop runtime ownership but preserve the locked linked worktree and branch.

### Retained-workspace catalog

A generation-independent read-only catalog scans only direct strict record files beneath the protected state root, with bounded repository/record counts and no arbitrary recursion. It returns workspace ID, full generated branch ref, abbreviated object IDs, disposition, clean/dirty/conflict/uncertain flags, timestamps, and informational source generation/child ID. Parent model surfaces omit absolute paths; the operator dashboard may show a bounded canonical local path as an explicitly operator-only field.

Exact model-callable controls are planned as bounded read-only status/collection plus consequential cleanup/merge operations keyed by `workspaceId` and expected record revision. Malformed or provenance-failing records appear only as bounded unresolved counts and cannot be cleaned automatically. Catalog inspection works even when Pi session history is missing/corrupt and never converts a retained workspace into a live child.

### Read-only collection

Status/collection may report bounded:

- generated workspace ID and branch;
- base/current commit IDs;
- clean/dirty/conflicted state;
- changed-file names/counts and diff statistics;
- commits reachable from the recorded base;
- whether the linked worktree is active, retained, cleaned, or uncertain.

No automatic commit is created. A child with approved bash may create commits through its own commands; otherwise edits may remain uncommitted and must be preserved.

### Cleanup

The first cleanup implementation is deliberately non-destructive:

- refuse conflicted or Git-dirty worktrees;
- do not treat ordinary clean status as proof of an empty disposable working tree: collect `status --ignored --porcelain=v1 -z --untracked-files=all` under the fixed config and independently walk the worktree through no-follow descriptor-bound traversal, comparing every filesystem entry against the exact recorded index/tree manifest;
- refuse cleanup when any ignored, untracked, extra, mismatched, unreadable, omitted, or unexpected file/symlink/special entry exists; empty directories may be removed only after proving they contain no entry;
- hold the cross-process repository lock and exact record revision continuously from ownership verification through manifest proof, unlock, Git removal, post-removal reconciliation, and record transition;
- unlock only after exact ownership proof and confirmation;
- remove the exact clean linked worktree without `--force`;
- retain the branch by default;
- relock or mark uncertain if removal does not settle observably;
- never use prune as cleanup.

Branch deletion is a separate stronger operation. The Phase 8 release must not use `git branch -D` or delete an unmerged branch. Any later branch-deletion feature requires exact merge/reachability proof plus separate confirmation.

### Merge

No merge occurs as part of spawn, completion, remove, cleanup, or shutdown. A future Phase 8 merge operation must:

- name the exact source workspace/branch and destination branch;
- require a clean destination and exact current HEAD precondition;
- receive explicit confirmation immediately before mutation;
- disable remotes, hooks, editors, signing, and external strategies;
- never push;
- report conflicts and uncertain outcomes without automatic retry;
- preserve the source branch/worktree until merge success and separate cleanup.

## 14. Security and trust boundaries

Worktrees isolate filesystem copies; they are not process, privilege, network, or adversarial-code sandboxes.

- Child bash remains same-UID local command execution and can mutate the parent checkout, sibling worktrees, Git common metadata, network-visible resources, same-UID process state, and arbitrary external paths. Worktree leases are cooperative coordination only.
- The extension never invokes Git checkout/smudge. It registers with `--no-checkout` and materializes exact blobs through strict object reads and no-follow filesystem operations. A later user-approved child bash may still invoke arbitrary Git behavior.
- Other Pi extensions, external editors/processes, and detached descendants remain in the same trusted computing base or outside cooperative coordination.
- A worktree branch/path is repository metadata, not an authorization token.
- Absolute paths and ownership records are extension-private but not secret-encryption boundaries against malicious same-process code.
- No remote operation or dependency installation is introduced by Phase 8 tests or runtime.

## 15. Phase 8 local-Git test requirements

`SA-801` completes the disposable harness prerequisite: typed no-checkout worktree/repository/object operations, strict parsers, a realpath-pinned feature probe, matching offline-guard grammars, and focused isolation/refusal tests. The generic compatibility `runGit(args)` path remains inspection-only, and no production worktree authority is enabled.

The list below is the **cumulative Phase 8 test matrix by `SA-809`**, not a claim that the prerequisite harness alone implements later production records, approvals, transactions, persistence, catalog, or runtime integration. `SA-802`–`SA-805` add those production behaviors and their matching cases.

At minimum, the cumulative suite must cover:

- clean repository inspection and exact base OID;
- two generated branches/worktrees created from one local repository;
- equivalent-path writes remaining physically isolated;
- worktree list parsing with `--porcelain -z`;
- lock/retention behavior;
- clean explicit removal preserving the branch;
- dirty/conflicted cleanup refusal and independent refusal of ignored, untracked, extra, special, unreadable, or manifest-mismatched filesystem entries even when ordinary Git status is clean;
- malformed/missing/mismatched ownership record refusal;
- unowned worktree refusal;
- path/symlink escape denial;
- branch/ref/path collision handling;
- exact batch-plan digest/one-shot approval binding and stale-plan rejection;
- per-child batch partial success, retained-after-runtime-failure, and uncertainty outcomes;
- cancellation before side effects;
- timeout/uncertainty reconciliation;
- cross-process lock/CAS behavior, crash-stale lock refusal, and cleanup verification-to-remove race exclusion;
- no-checkout object materialization, index/HEAD cleanliness, executable files, symlinks, gitlinks, malformed tree/batch framing, case/normalization collisions, and `.git` protection;
- exact V1/V2 active-branch precedence and malformed-latest suppression;
- catalog enumeration without current session history and refusal of malformed/unowned records;
- denial of `--force`, prune, branch deletion, remote-like args, unsafe config/includes, hooks, filters, partial-clone lazy fetch, alternate ambient Git environment, and environment pollution;
- temporary-root cleanup with no remotes and no effect outside the fixture sandbox.

The guard should validate dynamic OIDs, generated refs, and sandbox-contained paths structurally. It must not broaden to arbitrary Git argv.

## 16. Consequences

### Benefits

- Equivalent paths can be edited concurrently without shared-file contention.
- Child filesystem state remains attributable and recoverable.
- Runtime removal cannot silently destroy Git work.
- Existing shared mode remains the stable default.
- Public spawn arguments remain backward compatible.

### Costs

- Worktree children consume disk until explicitly cleaned.
- A clean committed parent baseline is required.
- Repositories using executable checkout filters are initially unsupported.
- Persistence gains a second history version.
- Manager/path/lease abstractions require multi-workspace generalization.
- Human confirmation is required even for read-only children because branch/worktree creation is a retained side effect.

## 17. Explicitly deferred

This decision does not authorize or design:

- reusable worktree groups;
- automatic commit creation;
- automatic merge, rebase, cherry-pick, conflict resolution, branch deletion, push, or remote access;
- force removal of dirty/locked worktrees;
- adoption or cleanup of worktrees not proven by exact extension metadata;
- container/VM sandboxing of child bash;
- copying uncommitted parent changes into a worktree;
- a fixed worktree count or concurrency semaphore.
