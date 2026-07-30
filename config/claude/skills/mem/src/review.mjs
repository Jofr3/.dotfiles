// The review queue — PLAN phase 4: "`/mem:review` triage UI (list staged,
// promote/edit/discard in batch)".
//
// Staging is what makes auto-capture safe: the regex gate in capture.mjs stages a
// guess without asking, and a staged row is invisible to retrieval until a human
// promotes it. That promise is only worth anything if the queue is actually
// drainable, so this file is the drain — and PLAN's exit test for the phase is a
// *promote rate*, which cannot be measured until promoting is one command.
//
// It is written for two producers, not one. PLAN, "Consolidation and pruning":
// tier 2 "proposes rather than applies" and "writes proposals into the same review
// queue as staged captures, so `/mem:review` is the one triage surface". So the
// queue is a list of SOURCES rather than a SELECT: each source knows how to list
// its items, resolve a ref to one, and carry out the three verbs. Slice 5b.2 adds
// a second entry to SOURCES and touches nothing else here, in bin/mem, or in the
// skill. The item shape is the seam — type, ref, actions, when, summary — and
// anything source-specific hangs off its own key.
//
// Everything here is model-free except one path: editing the *text* re-embeds it,
// because "the embedding travels with the text" (write.mjs) and leaving the old
// vector next to new wording makes the row unfindable by the words it now stores.
// Listing, promoting and discarding never load the model, so triage works on a
// machine whose model cache is gone — including the duplicate detection, which
// compares embeddings the rows already carry.

import { withDb } from './db.mjs';
import { EMB_DIM, EMB_MODEL, embed, vectorBlob } from './embed.mjs';
import {
  EVENT_ARCHIVED,
  ManageError,
  decorate,
  listMemories,
  resolveRef,
} from './manage.mjs';
import { PAIR_THRESHOLD } from './pairs.mjs';
import { resolveScope } from './scope.mjs';
import { assertNoSecrets } from './scrub.mjs';
import {
  DEDUP_THRESHOLD,
  EVENT_MERGED,
  KINDS,
  MAX_TEXT,
  MAX_WHY,
  mergePlan,
  normaliseText,
  recordEvent,
  requireOneOf,
  requireUnitInterval,
} from './write.mjs';

/** One screenful of queue, as with `list`. The queue should not need paging. */
export const QUEUE_LIMIT = 20;

/**
 * The similarity at which a staged item is treated as a restatement of an
 * existing active memory rather than a new one. Deliberately the *same* number
 * `mem add` dedups on: promoting is the moment the staged row enters retrieval,
 * so it is the moment PLAN countermeasure #3 — "near-duplicates update, they
 * don't accumulate" — has to apply, and two different thresholds for the same
 * question would eventually disagree.
 */
export const MERGE_THRESHOLD = DEDUP_THRESHOLD;

/**
 * The similarity at which a neighbour is worth *showing* a reviewer, as opposed
 * to acting on. It IS PLAN's tier-1 pair threshold — imported from pairs.mjs since
 * slice 5b.1 rather than restated, because "worth a human look" and "worth a
 * judge's look" are the same question asked by two surfaces, and the number is
 * model geometry that moves when EMB_MODEL does.
 *
 * The gap between the two numbers is real and measured: gte-small puts genuine
 * restatements around 0.94–0.97 and unrelated facts around 0.77, but "always use
 * pnpm to install dependencies" against "in this repo use pnpm and never npm, it
 * is the only installer we support" lands at 0.922 — the same fact, one point
 * below the merge line. Acting on those automatically is what the threshold was
 * measured to prevent; staying silent about them in the one surface whose job is
 * "should this join the store?" would be under-informing the only person who can
 * tell. So the queue flags from 0.85 and merges from 0.93.
 */
export const FLAG_THRESHOLD = PAIR_THRESHOLD;

export const EVENT_PROMOTED = 'promoted';
export const EVENT_EDITED = 'edited';

/** Fields `edit` may change, in the order they are reported. */
export const EDITABLE = ['text', 'why', 'kind', 'scope', 'salience', 'confidence'];

export class ReviewError extends Error {
  constructor(message, code = 'MEM_INVALID') {
    super(message);
    this.name = 'ReviewError';
    this.code = code;
  }
}

/**
 * The text rules `add` enforces, enforced again on an edit. Shared by the
 * validation inside `edit` and the pre-flight in the wrapper below, so the
 * pre-flight cannot end up looser than the thing it runs ahead of.
 */
export function checkedText(value) {
  const text = normaliseText(value);
  if (text === '') throw new ReviewError('Refusing to store an empty memory — --text needs a fact.');
  if (text.length > MAX_TEXT) {
    throw new ReviewError(`--text is ${text.length} characters, over the ${MAX_TEXT} cap.`);
  }
  return text;
}

// ------------------------------------------------------------ staged source --

/**
 * The nearest *active* memory to a staged one, in the staged row's own scope.
 *
 * No model: the distance is computed between two stored blobs, which is why the
 * queue can flag duplicates on a machine that has never run `mem warm`. The
 * filters mirror write.mjs's `nearestInScope` for the same reasons — same scope
 * and project_key so a project capture cannot merge into a global memory and
 * quietly widen its blast radius, same emb_model/emb_dim because a distance
 * between two vector spaces is a number with no meaning, `emb IS NOT NULL` so a
 * tombstone cannot sort first.
 */
export async function nearestActive(conn, row, { threshold = FLAG_THRESHOLD } = {}) {
  if (!row.emb_model || row.emb_dim === null || row.emb_dim === undefined) return null;

  const hit = await conn.get(
    `SELECT id, uid, text, why, kind, salience, confidence, pinned, created_at, updated_at,
            vector_distance_cos(emb, (SELECT emb FROM memories WHERE id = ?)) AS dist
       FROM memories
      WHERE status = 'active'
        AND scope = ?
        AND project_key IS ?
        AND emb_model = ?
        AND emb_dim = ?
        AND emb IS NOT NULL
        AND id <> ?
      ORDER BY dist
      LIMIT 1`,
    row.id,
    row.scope,
    row.project_key,
    row.emb_model,
    row.emb_dim,
    row.id,
  );

  // dist is NULL when the staged row has no embedding of its own — nothing to
  // compare, rather than "infinitely far", so say nothing instead of guessing.
  if (!hit || hit.dist === null || hit.dist === undefined) return null;

  const similarity = 1 - hit.dist;
  if (similarity < threshold) return null;
  return { ...hit, similarity };
}

/** A staged memory as a queue item. */
async function stagedItem(conn, row, { now, threshold = MERGE_THRESHOLD }) {
  const memory = decorate(row, now);
  const duplicate = await nearestActive(conn, row, { threshold: Math.min(threshold, FLAG_THRESHOLD) });
  return {
    type: 'staged-memory',
    ref: String(row.id),
    actions: ['promote', 'edit', 'discard'],
    // Queue order and "how long has this been sitting here", so a backlog is
    // visible as a backlog.
    when: row.created_at,
    summary: row.text,
    detail: row.why,
    memory,
    duplicate: duplicate
      ? {
          id: duplicate.id,
          uid: duplicate.uid,
          text: duplicate.text,
          similarity: duplicate.similarity,
          // Whether promoting would fold this into that, or merely put a close
          // neighbour next to it. The reviewer needs both, and needs to be able
          // to tell them apart.
          merges: duplicate.similarity >= threshold,
        }
      : null,
  };
}

/**
 * Apply a merge to the *target* row. Split from `promote` because the vector
 * source is what differs from write.mjs's version of this: there the new
 * embedding has just been computed, here it is already in the staged row, so it
 * is copied across in SQL and no model is loaded.
 */
async function mergeInto(conn, target, changes, stagedId, now) {
  const assignments = changes.map((c) => `${c.field} = ?`);
  const params = changes.map((c) => c.to);

  if (changes.some((c) => c.field === 'text')) {
    assignments.push('emb = (SELECT emb FROM memories WHERE id = ?)');
    params.push(stagedId);
  }

  assignments.push('updated_at = ?');
  params.push(now);

  await conn.run(`UPDATE memories SET ${assignments.join(', ')} WHERE id = ?`, ...params, target.id);
}

const stagedMemories = {
  type: 'staged-memory',

  async list(conn, { now = Date.now(), threshold, ...filter } = {}) {
    // Oldest first: a queue is drained from the front, and the item most likely
    // to rot unseen is the one that has been waiting longest.
    const { rows, total } = await listMemories(conn, {
      ...filter,
      statuses: ['staged'],
      sort: 'oldest',
      now,
    });
    const items = [];
    for (const row of rows) items.push(await stagedItem(conn, row, { now, threshold }));
    return { items, total };
  },

  /**
   * Resolve a ref to a staged item, or return null if this source has nothing by
   * that name. Returning null rather than throwing is what lets `resolveItem`
   * try the next source — see SOURCES.
   */
  async resolve(conn, ref, { now = Date.now(), threshold } = {}) {
    let row;
    try {
      row = await resolveRef(conn, ref);
    } catch (err) {
      if (err instanceof ManageError && err.code === 'MEM_NOT_FOUND') return null;
      throw err;
    }
    if (row.status !== 'staged') {
      throw new ReviewError(
        `#${row.id} is ${row.status}, not staged — the review queue holds captures ` +
          `awaiting a decision. Use 'mem forget' or 'mem pin' on memories already in the store.`,
        'MEM_NOT_QUEUED',
      );
    }
    return stagedItem(conn, row, { now, threshold });
  },

  /**
   * Accept the capture. Two outcomes, and which one happens is not a preference:
   * a staged row that restates an active memory has to *merge* into it, or the
   * five-item retrieval budget fills up with paraphrases of one fact. `mem add`
   * cannot have done this already — it dedups within the staged rows only, on
   * purpose, so that a guess never bumps the confidence of something a human
   * reviewed.
   *
   * The merged staged row becomes `superseded` rather than being deleted: the
   * capture happened, and the audit log has to be able to say where it went.
   */
  async promote(conn, item, { now = Date.now(), merge = true, threshold = MERGE_THRESHOLD } = {}) {
    const row = item.memory;
    const target = merge ? await nearestActive(conn, row, { threshold }) : null;

    if (target) {
      const changes = mergePlan(target, {
        text: row.text,
        why: row.why,
        salience: row.salience,
        confidence: row.confidence,
        pinned: row.pinned,
        // Both rows are real stored memories with real values, so the incoming
        // numbers are as explicit as the target's: max() wins, never a default.
        explicit: { salience: true, confidence: true },
      });
      await mergeInto(conn, target, changes, row.id, now);
      await conn.run(
        'UPDATE memories SET status = ?, superseded_by = ? WHERE id = ?',
        'superseded',
        target.id,
        row.id,
      );

      const eventId = await recordEvent(conn, {
        memoryId: target.id,
        event: EVENT_MERGED,
        at: now,
        detail: {
          via: 'review',
          threshold,
          similarity: target.similarity,
          changes,
          previous: { updated_at: target.updated_at },
          from: { id: row.id, uid: row.uid, status: row.status },
        },
      });
      await recordEvent(conn, {
        memoryId: row.id,
        event: EVENT_PROMOTED,
        at: now,
        detail: {
          via: 'review',
          merged_into: target.id,
          similarity: target.similarity,
          previous: { status: row.status },
        },
      });

      return {
        action: EVENT_MERGED,
        ref: item.ref,
        type: item.type,
        id: row.id,
        uid: row.uid,
        text: row.text,
        from: row.status,
        to: 'superseded',
        // The text the survivor now carries, not the one it carried a moment
        // ago: a merge can rewrite the target's wording (longest wins), and
        // reporting the old text would show the user a memory that no longer
        // exists in exactly the case where the wording changed under them.
        into: {
          id: target.id,
          uid: target.uid,
          text: changes.find((c) => c.field === 'text')?.to ?? target.text,
        },
        similarity: target.similarity,
        changes,
        eventId,
      };
    }

    // updated_at is deliberately untouched, as in manage.setStatus: an unused
    // memory decays from it, and bumping it here would date the memory from the
    // review rather than from the moment the user said it.
    await conn.run('UPDATE memories SET status = ? WHERE id = ?', 'active', row.id);
    const eventId = await recordEvent(conn, {
      memoryId: row.id,
      event: EVENT_PROMOTED,
      at: now,
      detail: {
        via: 'review',
        previous: { status: row.status },
        // Why this was not a merge: the runner-up, when there was one close
        // enough to be worth recording.
        nearest: item.duplicate
          ? { id: item.duplicate.id, similarity: item.duplicate.similarity }
          : null,
      },
    });

    return {
      action: EVENT_PROMOTED,
      ref: item.ref,
      type: item.type,
      id: row.id,
      uid: row.uid,
      text: row.text,
      from: row.status,
      to: 'active',
      into: null,
      similarity: null,
      changes: [],
      eventId,
    };
  },

  /**
   * Reject the capture — PLAN's pruning ladder rung 2, `status='archived'`, out
   * of retrieval and fully restorable.
   *
   * It writes an `archived` event and not a `discarded` one on purpose: that is
   * the event manage.mjs reads to decide what `mem forget --restore` restores
   * *to*, and it carries `previous.status = 'staged'`, so undoing a wrong
   * rejection puts the item back in the queue rather than promoting it to active
   * without review. `via: 'review'` is what marks it as a rejection — PLAN calls
   * a review rejection the strongest negative signal there is, and phase 5a's
   * feedback pass needs to find these. Acting on that signal (the confidence
   * decrement) is 5a's, not this slice's.
   */
  async discard(conn, item, { now = Date.now(), reason = null } = {}) {
    const row = item.memory;
    await conn.run('UPDATE memories SET status = ? WHERE id = ?', 'archived', row.id);
    const eventId = await recordEvent(conn, {
      memoryId: row.id,
      event: EVENT_ARCHIVED,
      at: now,
      detail: { via: 'review', reason, previous: { status: row.status } },
    });
    return {
      action: EVENT_ARCHIVED,
      ref: item.ref,
      type: item.type,
      id: row.id,
      uid: row.uid,
      text: row.text,
      from: row.status,
      to: 'archived',
      reason,
      eventId,
    };
  },

  /**
   * Fix the capture before accepting it. This is the verb that makes staging
   * worth having rather than a slower `mem add`: the gate hands the model one
   * sentence of the user's prompt and it is often nearly right, and rewriting it
   * by hand beats discarding and retyping.
   */
  async edit(
    conn,
    item,
    changes,
    { now = Date.now(), paths, env = process.env, cwd, vector = null } = {},
  ) {
    const row = item.memory;
    const applied = [];
    const change = (field, from, to) => {
      if (from !== to) applied.push({ field, from, to });
    };

    if (changes.text !== undefined) change('text', row.text, checkedText(changes.text));
    if (changes.why !== undefined) {
      const why = normaliseText(changes.why);
      if (why.length > MAX_WHY) {
        throw new ReviewError(`--why is ${why.length} characters, over the ${MAX_WHY} cap.`);
      }
      change('why', row.why, why === '' ? null : why);
    }
    if (changes.kind !== undefined) {
      change('kind', row.kind, requireOneOf(changes.kind, KINDS, 'kind'));
    }
    if (changes.salience !== undefined) {
      change('salience', row.salience, requireUnitInterval(changes.salience, 'salience'));
    }
    if (changes.confidence !== undefined) {
      change('confidence', row.confidence, requireUnitInterval(changes.confidence, 'confidence'));
    }
    if (changes.scope !== undefined) {
      const scope = resolveScope({ scope: changes.scope, cwd, env });
      change('scope', row.scope, scope.scope);
      change('project_key', row.project_key, scope.projectKey);
    }

    if (applied.length === 0) {
      throw new ReviewError(
        `Nothing to change on #${row.id} — pass one of: ${EDITABLE.map((f) => `--${f}`).join(', ')}.`,
      );
    }

    const text = applied.find((c) => c.field === 'text');
    const why = applied.find((c) => c.field === 'why');
    if (text || why) {
      // Before the embedding, as in the write path: a rejected edit must not have
      // cost a model load, and the secret must not become a vector either.
      assertNoSecrets({ text: text ? text.to : row.text, why: why ? why.to : row.why }, { env });
    }

    const assignments = applied.map((c) => `${c.field} = ?`);
    const params = applied.map((c) => c.to);

    if (text) {
      // The one place in this file that needs the model. New wording needs a new
      // vector or the row becomes unfindable by the words it now stores. The
      // caller normally hands one in, computed outside the transaction — see
      // `edit` below; embedding here is the fallback for a direct caller.
      const emb = vector ?? (await embed(text.to, { paths, env }));
      assignments.push('emb = vector32(?)', 'emb_model = ?', 'emb_dim = ?');
      params.push(vectorBlob(emb), EMB_MODEL, EMB_DIM);
    }

    // An edit is a restatement by a human, so it *does* move updated_at — unlike
    // promote and discard, which only change where the memory sits.
    assignments.push('updated_at = ?');
    params.push(now);

    await conn.run(`UPDATE memories SET ${assignments.join(', ')} WHERE id = ?`, ...params, row.id);
    const eventId = await recordEvent(conn, {
      memoryId: row.id,
      event: EVENT_EDITED,
      at: now,
      detail: { via: 'review', changes: applied, previous: { updated_at: row.updated_at } },
    });

    return {
      action: EVENT_EDITED,
      ref: item.ref,
      type: item.type,
      id: row.id,
      uid: row.uid,
      text: text ? text.to : row.text,
      changes: applied,
      eventId,
    };
  },
};

/**
 * Every producer of review items, in listing order.
 *
 * One today. Slice 5b.2 appends the consolidation proposals — PLAN: "writes
 * proposals into the same review queue as staged captures, so `/mem:review` is
 * the one triage surface" — and the CLI, the skill and the three verbs below
 * need no changes to see them, as long as the new source returns items of the
 * same shape and declares which of `promote|edit|discard` it supports.
 */
export const SOURCES = [stagedMemories];

/**
 * The source that owns an item. Looked up by `type` rather than carried on the
 * item, so an item is plain data all the way down and `--json` prints the whole
 * of it — the inspectability rule the rest of this plugin follows (PLAN
 * countermeasure #7) applies to the queue too.
 */
export function sourceFor(item) {
  const source = SOURCES.find((s) => s.type === item.type);
  if (!source) throw new ReviewError(`No review source handles '${item.type}'.`);
  return source;
}

// ------------------------------------------------------------------ queue --

/**
 * The queue itself: every source's items, oldest first, with a per-type total so
 * the caller can say "20 of 43" rather than implying it showed everything.
 */
export async function reviewQueue(conn, { limit = QUEUE_LIMIT, ...opts } = {}) {
  const items = [];
  const totals = {};
  let total = 0;

  for (const source of SOURCES) {
    const result = await source.list(conn, { limit, ...opts });
    items.push(...result.items);
    totals[source.type] = result.total;
    total += result.total;
  }

  items.sort((a, b) => (a.when ?? 0) - (b.when ?? 0) || a.ref.localeCompare(b.ref));
  return { items: items.slice(0, limit), total, totals };
}

/**
 * Find the item a ref names, across sources. A source that does not recognise the
 * ref returns null and the next one is tried; a source that recognises it but
 * refuses (a memory that exists and is not staged) throws, because that is an
 * answer and not a miss.
 */
export async function resolveItem(conn, ref, opts = {}) {
  for (const source of SOURCES) {
    const item = await source.resolve(conn, ref, opts);
    if (item) return item;
  }
  throw new ReviewError(`Nothing in the review queue matching '${ref}'.`, 'MEM_NOT_FOUND');
}

function requireAction(item, action) {
  if (!item.actions.includes(action)) {
    throw new ReviewError(`A ${item.type} cannot be ${action}d.`, 'MEM_UNSUPPORTED');
  }
  return item;
}

/** Open the database if the caller has no connection, then run `fn`. */
function onConn(fn, { conn, paths, env }) {
  return conn ? fn(conn) : withDb(fn, { paths, env });
}

/**
 * Run one verb over several refs in a single transaction — all of them or none,
 * so a half-triaged batch never has to be reconstructed by hand. Refs are
 * resolved inside the transaction too: resolving first and acting after would let
 * a concurrent `mem forget` slip between the two.
 */
function batch(action, refs, opts = {}) {
  const { conn, paths, env, ...rest } = opts;
  const run = (c) =>
    c
      .transactionAsync(async (tx) => {
        const results = [];
        const seen = new Set();
        for (const ref of refs) {
          const item = requireAction(await resolveItem(tx, ref, rest), action);
          if (seen.has(`${item.type}:${item.ref}`)) continue;
          seen.add(`${item.type}:${item.ref}`);
          results.push(await sourceFor(item)[action](tx, item, { ...rest, env }));
        }
        return results;
      })
      .immediate();
  return onConn(run, { conn, paths, env });
}

export async function review(opts = {}) {
  const { conn, paths, env, ...rest } = opts;
  return onConn((c) => reviewQueue(c, rest), { conn, paths, env });
}

export function promote(refs, opts = {}) {
  return batch('promote', refs, opts);
}

export function discard(refs, opts = {}) {
  return batch('discard', refs, opts);
}

/**
 * Edit one item, optionally promoting it in the same breath — the common triage
 * move is "fix the wording, then accept", and making it two commands means the
 * second one gets forgotten.
 *
 * The promote re-resolves the item after the edit rather than reusing the one it
 * just changed: editing the text changes the embedding, which changes what the
 * item duplicates, and promoting on a stale duplicate check is how a rewritten
 * capture would merge into the memory it no longer restates.
 */
export async function edit(ref, changes, opts = {}) {
  const { conn, paths, env = process.env, promote: alsoPromote = false, ...rest } = opts;

  const run = async (c) => {
    // Resolve first, then validate, then embed, then open the transaction — the
    // same order as the write path and for the same three reasons. A ref that is
    // not in the queue must fail saying so and not "the model is not cached"; a
    // rejected edit must not have cost a model load; and a model load must not
    // hold a write lock while it downloads 23 MB. The item is resolved again
    // inside the transaction, because between these two lines it can change.
    requireAction(await resolveItem(c, ref, rest), 'edit');

    let vector = null;
    if (changes.text !== undefined) {
      const text = checkedText(changes.text);
      assertNoSecrets({ text }, { env });
      vector = await embed(text, { paths, env });
    }

    return c
      .transactionAsync(async (tx) => {
        const item = requireAction(await resolveItem(tx, ref, rest), 'edit');
        const edited = await sourceFor(item).edit(tx, item, changes, { ...rest, paths, env, vector });
        if (!alsoPromote) return { edit: edited, promote: null };
        const fresh = requireAction(await resolveItem(tx, item.ref, rest), 'promote');
        return { edit: edited, promote: await sourceFor(fresh).promote(tx, fresh, { ...rest, env }) };
      })
      .immediate();
  };

  return onConn(run, { conn, paths, env });
}
