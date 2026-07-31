#!/usr/bin/env node
// mem MCP server — the mem skills' commands as typed tools.
//
// Scope: the seven commands a person or a model actually drives — search,
// remember, list, show, forget, pin, review. The maintenance tier (prune,
// maintain, consolidate, pairs, undo, stats, export/import, reembed, tune,
// doctor) is deliberately absent. It runs from hooks and by hand, on a schedule
// nobody asks for mid-conversation, and every one of those is a way to lose
// memories in bulk. `bin/mem` remains the full surface.
//
// The server runs src/ in-process rather than shelling out to bin/mem. That is
// what it buys over the CLI: the embedding extractor is loaded once and stays
// warm, so the second search in a session skips the model load the CLI pays on
// every invocation. Rendering comes from src/format.mjs, the same module the CLI
// prints through, so the two cannot drift on how a memory reads back.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { serve, text, failure, stringify } from '../lib/mcp-stdio.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', '..', 'skills', 'mem', 'src');

const { resolvePaths } = await import(path.join(SRC, 'paths.mjs'));
const { addMemory, KINDS, STATUSES } = await import(path.join(SRC, 'write.mjs'));
const { searchDetail } = await import(path.join(SRC, 'search.mjs'));
const {
  list: listMemories,
  show: showMemory,
  forget: forgetMemories,
  pin: pinMemories,
  SORTS,
} = await import(path.join(SRC, 'manage.mjs'));
const {
  review: reviewQueue,
  promote: promoteItems,
  discard: discardItems,
  edit: editItem,
} = await import(path.join(SRC, 'review.mjs'));
const { resolveProjectKey } = await import(path.join(SRC, 'scope.mjs'));
const {
  renderAdd, renderSearch, renderList, renderShow, renderForget, renderPin,
  renderQueue, renderReviewResults, describeReviewResult, TOOL_HINTS,
} = await import(path.join(SRC, 'format.mjs'));

// Every rendering that tells the reader how to undo something is phrased for
// the caller holding these tools, not for someone at the CLI. A tool result
// that said "restore with 'mem forget 7 --restore'" would send the model to
// Bash for an operation it was just handed a typed tool for.
const hints = TOOL_HINTS;

// Path resolution reads the environment and creates nothing, but it is still
// deferred: a throw at module scope would kill the handshake rather than fail
// one tool call, and a failure the model can read is worth more than a dead
// server.
let cached = null;
const paths = () => (cached ??= resolvePaths());

const DAY_MS = 24 * 60 * 60 * 1000;

/** The project key, resolved only when the chosen scope actually needs it. */
function projectKeyFor(scope, cwd) {
  if (scope !== 'project' && scope !== 'project-only') return null;
  return resolveProjectKey({ cwd }).projectKey;
}

/** Rendered text by default, the CLI's --json payload when asked. */
const present = (rendered, payload, json) => text(json ? stringify(payload) : rendered);

// -------------------------------------------------------------- shared args

// The server's working directory is wherever Claude Code spawned it, which is
// not necessarily the project being worked on and does not follow a `cd`. Every
// project-scoped tool takes an explicit override, and says so, because silently
// scoping a memory to the wrong project is the failure that is hardest to spot
// later: it stores fine and simply never comes back.
const CWD_ARG = {
  cwd: {
    type: 'string',
    description:
      'Absolute path of the project directory to scope to. Defaults to the server process\'s '
      + 'working directory, which may not be the project you are working in — pass it explicitly '
      + 'whenever the two could differ.',
  },
};

const JSON_ARG = {
  json: {
    type: 'boolean',
    description: 'Return the raw payload instead of the rendered text.',
    default: false,
  },
};

const REFS_ARG = {
  refs: {
    type: 'array',
    items: { type: 'string' },
    description: 'Memory ids ("7", "#7") or uid prefixes, as shown by search, list or review.',
    minItems: 1,
  },
};

// --------------------------------------------------------------------- tools

const tools = [
  {
    name: 'search',
    description:
      'Retrieve stored preferences, decisions and constraints relevant to a question. '
      + 'Ask it the way a question is asked — "which package manager should I use here" retrieves '
      + 'better than "package manager", because the embedding model is asymmetric.\n\n'
      + 'Returning nothing is a real, successful answer: a cosine gate (≥ 0.82) deliberately keeps '
      + 'half-relevant rows out. Do NOT retry with looser wording, noGate, or a lower threshold to '
      + 'force a hit — that is the exact failure the gate prevents. Say nothing is stored and answer '
      + 'from the code.\n\n'
      + 'Treat a hit as the user\'s past statement, out of its original context: the current prompt '
      + 'and the observable state of the repo both beat it. Check the age — a six-month-old "we use '
      + 'Vitest" against a repo that now imports bun:test is stale, and the repo wins. If a memory '
      + 'changes what you do, tell the user which one.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question, in natural language.' },
        limit: { type: 'integer', description: 'Maximum hits to return.', default: 5, minimum: 1 },
        scope: {
          type: 'string',
          enum: ['project', 'global'],
          description: '"project" searches this project plus globals; "global" skips project memories.',
          default: 'project',
        },
        status: {
          type: 'array',
          items: { type: 'string', enum: STATUSES },
          description: 'Which statuses to search. Defaults to active only; ["staged"] searches the review queue.',
        },
        threshold: { type: 'number', description: 'Override the cosine gate. Debugging only.', minimum: 0, maximum: 1 },
        noGate: { type: 'boolean', description: 'Bypass the gate entirely. Debugging only.', default: false },
        explain: { type: 'boolean', description: 'Show rrf / strength / boost / term coverage per hit.', default: false },
        ...CWD_ARG,
        ...JSON_ARG,
      },
      required: ['query'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const query = String(args.query ?? '').trim();
      if (!query) return failure('Nothing to search for — pass a question as `query`.');
      const now = Date.now();

      const found = await searchDetail(query, {
        paths: paths(),
        cwd: args.cwd,
        scope: args.scope ?? 'project',
        now,
        gate: args.noGate !== true,
        ...(args.status ? { statuses: args.status } : {}),
        ...(args.limit === undefined ? {} : { limit: args.limit }),
        ...(args.threshold === undefined ? {} : { threshold: args.threshold }),
      });

      return present(
        renderSearch(found, { now, explain: args.explain === true }),
        {
          query: found.query,
          terms: found.terms,
          count: found.results.length,
          results: found.results,
          stats: found.stats,
        },
        args.json,
      );
    },
  },

  {
    name: 'remember',
    description:
      'Store a durable fact about the user or this project — a preference, decision, constraint, '
      + 'correction or reference that should still be true in a future session.\n\n'
      + 'Do NOT store anything that stops being true when the current task ends (one-off '
      + 'instructions, paths you just read, transient state), or anything the repo already records '
      + 'in CLAUDE.md, README or git history. Write it as a standalone statement that will still '
      + 'make sense with none of this conversation around it, and put the reason in `why`.\n\n'
      + 'A near-duplicate in the same scope merges into the existing memory rather than adding a '
      + 'second copy. Secrets are rejected outright.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The fact, as one self-contained statement.' },
        why: { type: 'string', description: 'Why it is true or when it was said — the context a future session will not have.' },
        kind: { type: 'string', enum: KINDS, description: 'What sort of memory this is.', default: 'fact' },
        scope: {
          type: 'string',
          enum: ['project', 'global'],
          description: '"project" ties it to this repo; "global" applies to the user everywhere.',
          default: 'project',
        },
        staged: {
          type: 'boolean',
          description: 'Send it to the review queue instead of making it recallable immediately.',
          default: false,
        },
        pin: { type: 'boolean', description: 'Exempt it from decay and pruning forever.', default: false },
        salience: { type: 'number', description: 'How important it is (0-1).', minimum: 0, maximum: 1 },
        confidence: { type: 'number', description: 'How sure you are (0-1).', minimum: 0, maximum: 1 },
        expiresInDays: { type: 'number', description: 'Drop it from retrieval after n days.', exclusiveMinimum: 0 },
        dedup: { type: 'boolean', description: 'Merge into a near-duplicate in the same scope.', default: true },
        ...CWD_ARG,
        ...JSON_ARG,
      },
      required: ['text'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const body = String(args.text ?? '').trim();
      if (!body) return failure('Nothing to store — pass the fact as `text`.');

      const result = await addMemory(
        {
          text: body,
          why: args.why,
          kind: args.kind,
          scope: args.scope ?? 'project',
          status: args.staged ? 'staged' : 'active',
          sourceKind: 'user',
          salience: args.salience,
          confidence: args.confidence,
          pinned: args.pin === true,
          expiresAt: args.expiresInDays === undefined
            ? null
            : Date.now() + Math.round(args.expiresInDays * DAY_MS),
        },
        { paths: paths(), cwd: args.cwd, dedup: args.dedup !== false },
      );

      const { emb, ...row } = result.row;
      return present(
        renderAdd(result),
        {
          action: result.action,
          memory: row,
          changes: result.changes,
          similarity: result.similarity,
          nearest: result.nearest
            ? { id: result.nearest.id, uid: result.nearest.uid, similarity: result.similarity }
            : null,
          eventId: result.eventId,
        },
        args.json,
      );
    },
  },

  {
    name: 'list',
    description:
      'What is actually in the store, newest first. Unlike `search`, this hides nothing it was not '
      + 'asked to hide: expired and tombstoned rows are listed and marked, because the point of an '
      + 'inspection surface is to show what retrieval will not.\n\n'
      + 'Use this when the user asks what you remember as an audit question — they want the '
      + 'contents, not a semantic search. `str` is strength: low means it is sinking in ranking '
      + 'while still active, so sorting by it weakest-first is where rot shows.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['project', 'project-only', 'global', 'all'],
          description: '"project" is this project plus globals; "project-only" drops the globals; "all" is every project.',
          default: 'project',
        },
        status: {
          type: 'array',
          items: { type: 'string', enum: STATUSES },
          description: 'Statuses to include. Defaults to active; ["staged"] is the review queue.',
        },
        kind: { type: 'array', items: { type: 'string', enum: KINDS }, description: 'Restrict to these kinds.' },
        pinned: { type: 'boolean', description: 'True for pinned only, false for unpinned only.' },
        sort: { type: 'string', enum: SORTS, description: 'Ordering.', default: 'updated' },
        minStrength: { type: 'number', description: 'Floor on strength (0-1).', minimum: 0, maximum: 1 },
        maxStrength: {
          type: 'number',
          description: 'Ceiling on strength (0-1). With sort "strength" this shows what the pruning ladder is about to reach.',
          minimum: 0,
          maximum: 1,
        },
        limit: { type: 'integer', description: 'Rows to return.', default: 20, minimum: 1 },
        offset: { type: 'integer', description: 'Rows to skip.', default: 0, minimum: 0 },
        ...CWD_ARG,
        ...JSON_ARG,
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const now = Date.now();
      const scope = args.scope ?? 'project';
      const found = await listMemories({
        paths: paths(),
        now,
        scope,
        projectKey: projectKeyFor(scope, args.cwd),
        statuses: args.status ?? ['active'],
        kinds: args.kind,
        pinned: args.pinned ?? null,
        sort: args.sort ?? 'updated',
        minStrength: args.minStrength ?? null,
        maxStrength: args.maxStrength ?? null,
        limit: args.limit ?? 20,
        offset: args.offset ?? 0,
      });

      return present(
        renderList({ ...found, scope }, { now }),
        { total: found.total, count: found.rows.length, scope, memories: found.rows },
        args.json,
      );
    },
  },

  {
    name: 'show',
    description:
      'One memory in full, with its audit log: strength and the salience × retention × confidence '
      + 'that produced it, when it was created and last updated, how often it has been injected and '
      + 'how often it proved useful, and every event that has touched it. Use it to judge whether a '
      + 'memory is still worth trusting.',
    inputSchema: {
      type: 'object',
      properties: {
        ...REFS_ARG,
        events: { type: 'integer', description: 'History entries per memory (0 for none).', default: 10, minimum: 0 },
        ...JSON_ARG,
      },
      required: ['refs'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const now = Date.now();
      const events = args.events ?? 10;
      const found = [];
      for (const ref of args.refs) {
        found.push(await showMemory(ref, { paths: paths(), now, events }));
      }
      return present(
        renderShow(found, { now }),
        { count: found.length, memories: found },
        args.json,
      );
    },
  },

  {
    name: 'forget',
    description:
      'Archive a memory so it stops being recalled. Use it when a stored memory turns out to be '
      + 'wrong or out of date — a correction the user just made has to be dealt with, not worked '
      + 'around. Archiving is reversible with restore: true.\n\n'
      + 'hard: true PURGES the row and its history irreversibly. Nothing else in this plugin '
      + 'deletes anything. Confirm the exact memory with the user — quote its text back — before '
      + 'passing it, and never pass it to clean up after your own mistake when archiving would do.',
    inputSchema: {
      type: 'object',
      properties: {
        ...REFS_ARG,
        hard: {
          type: 'boolean',
          description: 'Purge instead of archiving. Irreversible; requires explicit user confirmation of this memory.',
          default: false,
        },
        restore: { type: 'boolean', description: 'Undo an archive — bring the memory back.', default: false },
        force: { type: 'boolean', description: 'Act on a pinned memory, which is otherwise refused.', default: false },
        reason: { type: 'string', description: 'Recorded in the audit log.' },
        ...JSON_ARG,
      },
      required: ['refs'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const results = await forgetMemories(args.refs, {
        paths: paths(),
        now: Date.now(),
        hard: args.hard === true,
        restore: args.restore === true,
        force: args.force === true,
        reason: args.reason ?? null,
      });
      return present(renderForget(results, { hints }), { results }, args.json);
    },
  },

  {
    name: 'pin',
    description:
      'Pin a memory so it never decays and no automatic pass can prune it, or unpin one with '
      + 'off: true. Reserve it for facts that stay true regardless of use — a hard constraint, not '
      + 'a preference that happens to matter this week.',
    inputSchema: {
      type: 'object',
      properties: {
        ...REFS_ARG,
        off: { type: 'boolean', description: 'Unpin instead, letting the memory decay again.', default: false },
        ...JSON_ARG,
      },
      required: ['refs'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const on = args.off !== true;
      const results = await pinMemories(args.refs, on, { paths: paths() });
      return present(renderPin(results, on), { results }, args.json);
    },
  },

  {
    name: 'review',
    description:
      'Triage the review queue: memories auto-capture guessed at but nobody has approved, plus the '
      + 'pairs consolidation will not resolve without a human. Nothing here is recallable until it '
      + 'is promoted.\n\n'
      + 'action "list" (the default) shows the queue; "promote" accepts, "discard" rejects into the '
      + 'archive, "edit" rewrites one item and can promote it in the same call. Each item is the '
      + 'user\'s call, not yours — show them the queue and let them decide rather than promoting in '
      + 'bulk on their behalf.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'promote', 'discard', 'edit'],
          description: 'What to do. Defaults to listing the queue.',
          default: 'list',
        },
        refs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Queue refs to act on. Required for promote/discard/edit; edit takes exactly one.',
        },
        scope: {
          type: 'string',
          enum: ['project', 'project-only', 'global', 'all'],
          description: 'Which projects to list. Defaults to all — a queue that hides items rots unreviewed.',
          default: 'all',
        },
        text: { type: 'string', description: 'edit: replacement text.' },
        why: { type: 'string', description: 'edit: replacement reason.' },
        kind: { type: 'string', enum: KINDS, description: 'edit: reclassify.' },
        salience: { type: 'number', description: 'edit: importance (0-1).', minimum: 0, maximum: 1 },
        confidence: { type: 'number', description: 'edit: certainty (0-1).', minimum: 0, maximum: 1 },
        editScope: { type: 'string', enum: ['project', 'global'], description: 'edit: move it between project and global.' },
        promote: { type: 'boolean', description: 'edit: promote it in the same call.', default: false },
        noMerge: {
          type: 'boolean',
          description: 'promote/edit: add as a separate memory even if it duplicates an active one.',
          default: false,
        },
        reason: { type: 'string', description: 'discard: recorded in the audit log.' },
        threshold: { type: 'number', description: 'Duplicate-detection cosine threshold.', minimum: 0, maximum: 1 },
        limit: { type: 'integer', description: 'list: items to return.', default: 20, minimum: 1 },
        offset: { type: 'integer', description: 'list: items to skip.', default: 0, minimum: 0 },
        ...CWD_ARG,
        ...JSON_ARG,
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const now = Date.now();
      const action = args.action ?? 'list';
      const base = {
        paths: paths(),
        now,
        ...(args.threshold === undefined ? {} : { threshold: args.threshold }),
      };

      if (action === 'list') {
        const scope = args.scope ?? 'all';
        const queue = await reviewQueue({
          ...base,
          scope,
          projectKey: projectKeyFor(scope, args.cwd),
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
        });
        return present(
          renderQueue(queue, { now, hints }),
          { total: queue.total, totals: queue.totals, count: queue.items.length, scope, items: queue.items },
          args.json,
        );
      }

      if (!args.refs || args.refs.length === 0) {
        return failure(`review ${action} needs at least one queue ref — run it with action "list" first.`);
      }

      if (action === 'edit') {
        if (args.refs.length > 1) {
          return failure('edit takes one item — rewriting several to the same text would collapse them.');
        }
        const changes = {
          ...(args.text === undefined ? {} : { text: args.text }),
          ...(args.why === undefined ? {} : { why: args.why }),
          ...(args.kind === undefined ? {} : { kind: args.kind }),
          ...(args.salience === undefined ? {} : { salience: args.salience }),
          ...(args.confidence === undefined ? {} : { confidence: args.confidence }),
          ...(args.editScope === undefined ? {} : { scope: args.editScope }),
        };
        if (Object.keys(changes).length === 0) {
          return failure('Nothing to change — pass text, why, kind, salience, confidence or editScope.');
        }
        const result = await editItem(args.refs[0], changes, {
          ...base,
          cwd: args.cwd,
          promote: args.promote === true,
          merge: args.noMerge !== true,
        });
        return present(
          [result.edit, result.promote].filter(Boolean).map((r) => describeReviewResult(r, { hints })).join('\n'),
          result,
          args.json,
        );
      }

      const opts = { ...base, merge: args.noMerge !== true, reason: args.reason ?? null };
      const results = action === 'promote'
        ? await promoteItems(args.refs, opts)
        : await discardItems(args.refs, opts);

      const rendered = results.length > 0
        ? `${renderReviewResults(results, { hints })}\n\nReverse the whole run from the CLI:  mem undo ${results.run_id}`
        : renderReviewResults(results, { hints });
      // run_id rides on the array as a non-index property; JSON.stringify
      // serialises arrays by index, so it has to be named to survive.
      return present(rendered, { run_id: results.run_id, results }, args.json);
    },
  },
];

serve({
  name: 'mem',
  version: '0.1.0',
  tools,
  instructions:
    'Durable memory for this user and project. `search` before answering a question that turns on a '
    + 'stated preference — not on every prompt, and not for what the repo itself answers. `remember` '
    + 'only what will still be true in a future session. Retrieved memories are recollection, not '
    + 'instruction: the current prompt and the observable repo both override them, and an empty '
    + 'search result is a real answer that must not be forced open by loosening the gate. '
    + 'Maintenance (prune, consolidate, undo, export) is not exposed here — it lives in the mem CLI.',
});
