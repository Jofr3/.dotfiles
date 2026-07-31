// Resolution — PLAN's table, and the guard that stops it running over a human.
//
//   | duplicate     | merge into the better-worded one; sum counts; keep earliest created_at |
//   | contradiction | newer supersedes older (status='superseded', superseded_by)            |
//   | refinement    | keep both, link `refines`, demote the general one's salience           |
//   | complementary | keep both, link `related`                                             |
//   | unrelated     | record so the pair is never re-judged                                 |
//
// pairs.mjs finds the pairs, judge.mjs classifies them, and this file is what
// happens next. It is deliberately the only file of the three that can change a
// memory, and the only one that decides whether it may.
//
// THE GUARD IS THE REASON THIS IS NOT A SWITCH STATEMENT. PLAN: "Recency is not
// automatically right. A memory captured yesterday from a throwaway experiment
// must not silently supersede a pinned constraint. Guard: if the older memory is
// pinned, or has confidence more than 0.3 higher, the pair goes to human review
// instead of auto-resolving." A judge that is right 95% of the time and acts
// automatically is a store that quietly retires one true memory in twenty — and
// the ones it retires are exactly the ones a human cared enough to pin.
//
// So a routed pair is not dropped and not applied: it becomes an item in the
// review queue, next to the staged captures, which is PLAN's "writes proposals
// into the same review queue as staged captures, so `/mem:review` is the one
// triage surface". review.mjs was built for two producers and this is the second.
//
// TWO RECORDS PER JUDGED PAIR, AND THEY ARE NOT THE SAME RECORD. The verdict
// cache (`pair:<lo>:<hi>`, pairs.mjs) is the receipt: this pair was judged, at
// this time, so stop offering it while neither text has moved. The proposal
// (`proposal:<lo>:<hi>`, here) is the pending *action*: a contradiction a human
// still has to rule on. Caching without proposing would make a routed pair vanish
// — judged, never resolved, never shown again. Proposing without caching would
// re-judge it, and pay for it, on every run until the human got to it.
//
// NOTHING HERE LOADS THE EMBEDDING MODEL, which is a property worth keeping and
// not an accident: the survivor of a merge is chosen as the row whose text is
// already the better-worded one, so no text is ever rewritten and no vector ever
// goes stale. Triage on a machine with no model cached keeps working, exactly as
// in review.mjs.

import { EVENT_RESTORED, decorate } from './manage.mjs';
import {
  EVENT_CONSOLIDATED,
  EVENT_PAIR_JUDGED,
  KEEP_BOTH_VERDICTS,
  PROPOSAL_PREFIX,
  VERDICTS,
  cacheVerdict,
  detectPairs,
  dropMetaFor,
  markConsolidated,
  orderPair,
  pairKey,
} from './pairs.mjs';
import { JUDGE_BATCH, judgePairs } from './judge.mjs';
import { STATUSES, recordEvent } from './write.mjs';

/**
 * PLAN's number: "confidence more than 0.3 higher" routes to review. Strictly
 * more — a pair exactly 0.3 apart is not the case the sentence describes, and the
 * boundary has to fall on the side that acts or the guard slowly becomes a veto
 * on every resolution involving a confident memory.
 */
export const GUARD_CONFIDENCE_MARGIN = 0.3;

/**
 * How far a refinement demotes the general memory's salience. PLAN says "demote"
 * and does not say how far, so this is a choice: one notch, not a burial. The
 * specific memory should win the ≤5 item retrieval budget when both match, and
 * the general one should still be there when it is the only thing that matches.
 * A run of refinements compounds — three of them take 0.5 to 0.256 — which is the
 * intended behaviour for a rule that keeps being qualified.
 */
export const DEMOTE_FACTOR = 0.8;

/** Demotion floor. Salience 0 is a memory that can never be retrieved again. */
export const MIN_SALIENCE = 0.05;

/**
 * The classes `--apply` may act on without asking.
 *
 * PLAN, reversibility: "`--apply` applies only auto-safe classes (duplicates);
 * contradictions always route through `/mem:review`". The three keep-both classes
 * are here with the duplicates because of what their resolutions *are*: a link
 * row, a salience notch, a cache entry. No memory leaves retrieval, no text is
 * rewritten, and every one of them is one event to invert. `contradiction` is the
 * only class whose resolution takes a true-until-now memory out of the store, and
 * it is the only one that always waits for a human.
 *
 * A caller may narrow this — `consolidatePairs({ autoClasses: ['duplicate'] })`
 * is PLAN's sentence read literally, and it costs only extra review items.
 */
export const AUTO_CLASSES = ['duplicate', ...KEEP_BOTH_VERDICTS];

/** `meta` key prefix for one pending proposal. The verdict's receipt is `pair:`. */
export { PROPOSAL_PREFIX };

/** The review queue's second source type. */
export const PROPOSAL_TYPE = 'consolidation-pair';

export const REL_REFINES = 'refines';
export const REL_RELATED = 'related';

export const EVENT_SUPERSEDED = 'superseded';
export const EVENT_LINKED = 'linked';
export const EVENT_DEMOTED = 'demoted';
export const EVENT_MERGED = 'merged';
export const EVENT_PROPOSED = 'proposed';
export const EVENT_DECLINED = 'declined';

/**
 * What an undo writes. Named `un…` after 5a.4's `untombstoned` rather than reusing
 * the forward name with a flag, so `mem show <id>` reads as a history — "merged,
 * then unmerged" — instead of as the same thing having happened twice.
 *
 * There is no `unproposed` or `unjudged` here: those two inversions delete a
 * `meta` row and change no memory, and an event on a memory nobody touched is a
 * line in a log whose whole job is to explain why a memory looks like it does.
 */
export const EVENT_UNMERGED = 'unmerged';
export const EVENT_UNLINKED = 'unlinked';
export const EVENT_UNDEMOTED = 'undemoted';

/** What a class does, once the guard has let it through. */
export const ACTIONS = {
  duplicate: 'merge',
  contradiction: 'supersede',
  refinement: 'refine',
  complementary: 'relate',
  unrelated: 'none',
};

export class ResolveError extends Error {
  constructor(message, code = 'MEM_INVALID') {
    super(message);
    this.name = 'ResolveError';
    this.code = code;
  }
}

const round = (n, places = 4) => {
  const f = 10 ** places;
  return Math.round(Number(n) * f) / f;
};

const maxOf = (a, b) => {
  if (a === null || a === undefined) return b ?? null;
  if (b === null || b === undefined) return a ?? null;
  return Math.max(a, b);
};

// ------------------------------------------------------------- which is which --

/**
 * Older and newer, by `created_at` with the id as the tie-break.
 *
 * `created_at` and not `updated_at`: PLAN's contradiction rule is about which
 * fact came first, and a memory that was merged into last week did not stop being
 * the older one. The id tie-break exists because two memories written in the same
 * millisecond are a real thing on an import.
 */
export function byAge([x, y]) {
  const older = x.created_at === y.created_at ? (x.id < y.id ? x : y) : x.created_at <= y.created_at ? x : y;
  const newer = older === x ? y : x;
  return { older, newer };
}

/**
 * The survivor of a merge: PLAN's "the better-worded one".
 *
 * Length is the proxy, as it is in write.mjs's mergePlan — "the longer text is
 * the more specific one, and discarding specificity is the failure that cannot be
 * undone from the row alone". A tie goes to the older row, so a merge with
 * nothing to choose between the wordings keeps the memory that has been proving
 * itself for longer, and its vector.
 *
 * That the survivor's own text always wins is what keeps this file model-free:
 * nothing is ever re-worded, so no embedding is ever left describing text that is
 * no longer there.
 */
export function betterWorded([x, y]) {
  if (x.text.length === y.text.length) return byAge([x, y]).older;
  return x.text.length > y.text.length ? x : y;
}

// -------------------------------------------------------------------- the plan --

/**
 * PLAN's guard, over the two ROWS a resolution would act on — `older`, `newer`
 * and the rows it `touches`, not their ids: every one of the three tests below
 * reads a column, and a guard handed ids would read `undefined` and wave
 * everything through.
 *
 * Three reasons, and the third is not in PLAN's sentence — it follows from a rule
 * PLAN states elsewhere twice: `pinned = 1` means "never decays, never pruned,
 * exempt from all automatic actions". The written guard covers the older row
 * because that is the case it was arguing about; a resolution that would supersede,
 * demote or rewrite ANY pinned row is the same violation with the roles swapped,
 * and leaving it out would let a newly pinned memory be merged away by an older
 * one it happened to restate.
 *
 * The confidence test is one-directional on purpose. A newer memory that is much
 * MORE confident than the older one is the ordinary case this whole subsystem
 * exists to act on; it is the reverse — the store trusting the old fact far more
 * than the new one — that means somebody should look.
 */
export function guardPlan({ older, newer, touches }, { margin = GUARD_CONFIDENCE_MARGIN } = {}) {
  if (touches.length === 0) return null;

  if (older.pinned === 1) {
    return {
      reason: 'older-pinned',
      why: `#${older.id} is pinned — a pinned memory is exempt from automatic changes.`,
    };
  }

  const gap = round((older.confidence ?? 0) - (newer.confidence ?? 0));
  if (gap > margin) {
    return {
      reason: 'older-more-confident',
      why:
        `#${older.id} is ${gap.toFixed(2)} more confident than #${newer.id} — recency alone ` +
        'is not enough to retire it.',
      gap,
      margin,
    };
  }

  const pinned = touches.find((row) => row.pinned === 1);
  if (pinned) {
    return {
      reason: 'pinned-row-changed',
      why: `#${pinned.id} is pinned and this would change it.`,
    };
  }

  return null;
}

/**
 * Turn one judged pair into a plan: what the table prescribes, whether the guard
 * lets it happen, and which of the two rows it would touch.
 *
 * Pure — no database, no clock, no writes. The plan IS the dry run, which is why
 * every field a human would need to argue with it is on it rather than computed
 * later at apply time.
 */
export function planPair(pair, verdict, { autoClasses = AUTO_CLASSES, margin = GUARD_CONFIDENCE_MARGIN } = {}) {
  const klass = verdict?.class;
  if (!VERDICTS.includes(klass)) {
    throw new ResolveError(`unknown verdict '${klass}' for ${pair?.key}.`);
  }
  const [lo, hi] = pair.rows;
  const { older, newer } = byAge([lo, hi]);

  const base = {
    key: pair.key,
    a: pair.a,
    b: pair.b,
    similarity: pair.similarity ?? null,
    scope: pair.scope ?? null,
    project_key: pair.project_key ?? null,
    class: klass,
    why: verdict.why ?? null,
    older: older.id,
    newer: newer.id,
    rows: pair.rows,
  };

  // The shape first, the permission second: the guard needs to know what would be
  // touched before it can say whether it may be.
  const shaped = (() => {
    if (klass === 'duplicate') {
      const survivor = betterWorded([lo, hi]);
      const loser = survivor === lo ? hi : lo;
      return { action: 'merge', survivor: survivor.id, loser: loser.id, touches: [survivor, loser] };
    }
    if (klass === 'contradiction') {
      return { action: 'supersede', survivor: newer.id, loser: older.id, touches: [older] };
    }
    if (klass === 'refinement') {
      // The judge is asked which side states the broader rule; when it declines to
      // say, the shorter text is the general one and a tie means neither is —
      // which degrades to `complementary`'s resolution rather than guessing which
      // memory to demote.
      const general = generalSide(pair, verdict);
      if (!general) return { action: 'relate', touches: [] };
      const specific = general === lo ? hi : lo;
      return { action: 'refine', general: general.id, specific: specific.id, touches: [general] };
    }
    if (klass === 'complementary') return { action: 'relate', touches: [] };
    return { action: 'none', touches: [] };
  })();

  const guard = guardPlan({ older, newer, touches: shaped.touches }, { margin });
  return {
    ...base,
    ...shaped,
    guard,
    // Two independent reasons a plan waits for a human, kept apart because they
    // mean different things: `contradiction` waits by policy and would still wait
    // if every row were unpinned, the guard fires on this particular pair.
    auto: autoClasses.includes(klass),
    route: guard || !autoClasses.includes(klass) ? 'review' : 'apply',
    touches: shaped.touches.map((row) => row.id),
  };
}

/** Which row states the broader rule, or null when there is no answer worth acting on. */
function generalSide(pair, verdict) {
  const [lo, hi] = pair.rows;
  if (verdict.general === 'a') return lo;
  if (verdict.general === 'b') return hi;
  if (lo.text.length === hi.text.length) return null;
  return lo.text.length < hi.text.length ? lo : hi;
}

// ------------------------------------------------------------------ applying --

const ROW_COLUMNS = `id, uid, kind, scope, project_key, text, why, status, superseded_by,
                     salience, confidence, pinned, created_at, updated_at,
                     last_injected_at, injected_count, last_used_at, useful_count,
                     expires_at, consolidated_at`;

async function readRows(conn, ids) {
  const rows = await conn.all(
    `SELECT ${ROW_COLUMNS} FROM memories WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ...ids,
  );
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * The field-level plan for a merge, from the two rows as they are NOW.
 *
 * PLAN: "merge into the better-worded one; sum counts; keep earliest created_at".
 * The counts are summed rather than maxed because they are evidence of use and
 * both rows earned theirs; `created_at` keeps the earliest because the merged
 * memory is as old as the older half of it, and decay reads that.
 *
 * `updated_at` IS DELIBERATELY NOT TOUCHED, unlike write.mjs's merge. There, a
 * merge is a user restating a fact, which is real evidence and should reset the
 * decay clock. Here it is the store tidying itself: bumping the clock would hand
 * every consolidated memory a free extension of its half-life, and the store would
 * keep alive precisely the memories it has been talking to itself about.
 */
export function mergeChanges(survivor, loser) {
  const changes = [];
  const change = (field, to) => {
    const from = survivor[field] ?? null;
    if (from !== to) changes.push({ field, from, to });
  };

  if (loser.why && (!survivor.why || loser.why.length > survivor.why.length)) change('why', loser.why);
  change('salience', Math.max(survivor.salience, loser.salience));
  change('confidence', Math.max(survivor.confidence, loser.confidence));
  change('pinned', survivor.pinned === 1 || loser.pinned === 1 ? 1 : 0);
  change('created_at', Math.min(survivor.created_at ?? 0, loser.created_at ?? 0) || survivor.created_at);
  change('injected_count', (survivor.injected_count ?? 0) + (loser.injected_count ?? 0));
  change('useful_count', (survivor.useful_count ?? 0) + (loser.useful_count ?? 0));
  change('last_injected_at', maxOf(survivor.last_injected_at, loser.last_injected_at));
  change('last_used_at', maxOf(survivor.last_used_at, loser.last_used_at));
  return changes;
}

const applyChanges = (conn, id, changes) =>
  changes.length === 0
    ? Promise.resolve()
    : conn.run(
        `UPDATE memories SET ${changes.map((c) => `${c.field} = ?`).join(', ')} WHERE id = ?`,
        ...changes.map((c) => c.to),
        id,
      );

const link = (conn, src, dst, rel) =>
  conn.run(
    'INSERT INTO memory_links(src, dst, rel) VALUES (?, ?, ?) ON CONFLICT(src, dst, rel) DO NOTHING',
    src,
    dst,
    rel,
  );

/**
 * Carry out one plan — or, with `dryRun`, work out exactly what it would do and
 * write nothing.
 *
 * ONE CODE PATH FOR BOTH, which is prune.mjs's split (`due()` reads, `apply()`
 * acts on what it returned) taken one step further: here the field changes depend
 * on rows that may have moved since detection, so a preview computed by different
 * code than the write would eventually preview something else. The dry run is the
 * same function with the four `conn.run` calls skipped.
 *
 * It re-reads both rows rather than trusting the plan's copies, and refuses on
 * anything that has moved: a purged row, one already superseded by something else,
 * a row that is no longer active. A resolution applied over a later decision is
 * the failure `mem undo` exists for, and not making it is cheaper than undoing it.
 */
export async function applyPlan(conn, plan, { now = Date.now(), runId = null, dryRun = false } = {}) {
  const skip = (why) => ({ ok: false, key: plan.key, action: plan.action, why });
  if (plan.action === 'none') {
    return { ok: true, key: plan.key, action: 'none', class: plan.class, changes: [], events: [] };
  }

  const rows = await readRows(conn, [plan.a, plan.b]);
  for (const id of [plan.a, plan.b]) {
    const row = rows.get(id);
    if (!row) return skip(`#${id} is gone`);
    if (row.status !== 'active') return skip(`#${id} is ${row.status}, not active`);
  }

  const events = [];
  const note = async (memoryId, event, detail) => {
    if (dryRun) return null;
    const id = await recordEvent(conn, { memoryId, event, at: now, detail: { ...detail, run_id: runId, pair: plan.key, class: plan.class, via: 'consolidate' } });
    events.push({ id, event, memory_id: memoryId });
    return id;
  };

  if (plan.action === 'merge') {
    const survivor = rows.get(plan.survivor);
    const loser = rows.get(plan.loser);
    const changes = mergeChanges(survivor, loser);
    if (!dryRun) {
      await applyChanges(conn, survivor.id, changes);
      await conn.run(
        'UPDATE memories SET status = ?, superseded_by = ? WHERE id = ?',
        'superseded',
        survivor.id,
        loser.id,
      );
    }
    await note(survivor.id, EVENT_MERGED, {
      similarity: plan.similarity,
      changes,
      from: { id: loser.id, uid: loser.uid, status: loser.status, text: loser.text },
      previous: Object.fromEntries(changes.map((c) => [c.field, c.from])),
    });
    await note(loser.id, EVENT_SUPERSEDED, {
      by: survivor.id,
      merged: true,
      previous: { status: loser.status, superseded_by: loser.superseded_by ?? null },
    });
    return {
      ok: true,
      key: plan.key,
      action: 'merge',
      class: plan.class,
      survivor: survivor.id,
      loser: loser.id,
      text: survivor.text,
      changes,
      events,
    };
  }

  if (plan.action === 'supersede') {
    const loser = rows.get(plan.loser);
    if (!dryRun) {
      await conn.run(
        'UPDATE memories SET status = ?, superseded_by = ? WHERE id = ?',
        'superseded',
        plan.survivor,
        loser.id,
      );
    }
    await note(loser.id, EVENT_SUPERSEDED, {
      by: plan.survivor,
      merged: false,
      why: plan.why,
      previous: { status: loser.status, superseded_by: loser.superseded_by ?? null },
    });
    return {
      ok: true,
      key: plan.key,
      action: 'supersede',
      class: plan.class,
      survivor: plan.survivor,
      loser: loser.id,
      text: loser.text,
      changes: [{ field: 'status', from: loser.status, to: 'superseded' }],
      events,
    };
  }

  if (plan.action === 'refine') {
    const general = rows.get(plan.general);
    const to = Math.max(MIN_SALIENCE, round(general.salience * DEMOTE_FACTOR));
    const changes = to === general.salience ? [] : [{ field: 'salience', from: general.salience, to }];
    if (!dryRun) {
      await link(conn, plan.specific, general.id, REL_REFINES);
      await applyChanges(conn, general.id, changes);
    }
    await note(plan.specific, EVENT_LINKED, { rel: REL_REFINES, src: plan.specific, dst: general.id });
    if (changes.length > 0) {
      await note(general.id, EVENT_DEMOTED, {
        factor: DEMOTE_FACTOR,
        salience: to,
        previous: { salience: general.salience },
      });
    }
    return {
      ok: true,
      key: plan.key,
      action: 'refine',
      class: plan.class,
      general: general.id,
      specific: plan.specific,
      rel: REL_REFINES,
      changes,
      events,
    };
  }

  // relate: PLAN's "keep both, link `related`". Written once in canonical id
  // order — the relation is symmetric, and two rows saying the same thing is a
  // second row to keep in step with the first for no gain.
  if (!dryRun) await link(conn, plan.a, plan.b, REL_RELATED);
  await note(plan.a, EVENT_LINKED, { rel: REL_RELATED, src: plan.a, dst: plan.b });
  return {
    ok: true,
    key: plan.key,
    action: 'relate',
    class: plan.class,
    rel: REL_RELATED,
    changes: [],
    events,
  };
}

// ------------------------------------------------------------------ proposals --

export const proposalKey = (a, b) => {
  const ordered = orderPair(a, b);
  return `${PROPOSAL_PREFIX}${ordered.a}:${ordered.b}`;
};

const UPSERT_META =
  'INSERT INTO meta(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v';

const stampOf = (row) => row.updated_at ?? row.created_at ?? 0;

/**
 * Park a plan the guard (or policy) will not let run, as a review item.
 *
 * It stores the *stamps* of both rows as well as the plan, for the reason the
 * verdict cache stores its own date: a proposal is a statement about two texts,
 * and one of them being rewritten tomorrow makes the proposal an answer to a
 * question nobody asked. Stale proposals are hidden from the queue and refused by
 * `promote` rather than being applied to text the judge never saw.
 */
export async function writeProposal(conn, plan, { now = Date.now(), runId = null } = {}) {
  const key = proposalKey(plan.a, plan.b);
  const [lo, hi] = plan.rows;
  const record = {
    a: plan.a,
    b: plan.b,
    class: plan.class,
    action: plan.action,
    why: plan.why ?? null,
    guard: plan.guard,
    older: plan.older,
    newer: plan.newer,
    survivor: plan.survivor ?? null,
    loser: plan.loser ?? null,
    general: plan.general ?? null,
    specific: plan.specific ?? null,
    similarity: plan.similarity ?? null,
    scope: plan.scope ?? null,
    project_key: plan.project_key ?? null,
    at: now,
    run_id: runId,
    stamps: { [lo.id]: stampOf(lo), [hi.id]: stampOf(hi) },
  };
  await conn.run(UPSERT_META, key, JSON.stringify(record));
  const eventId = await recordEvent(conn, {
    memoryId: plan.a,
    event: EVENT_PROPOSED,
    at: now,
    detail: { ...record, via: 'consolidate', pair: pairKey(plan.a, plan.b) },
  });
  return { key, ...record, eventId };
}

const parseProposal = (k, v) => {
  let record = null;
  try {
    record = JSON.parse(v);
  } catch {
    return null;
  }
  const ids = k.slice(PROPOSAL_PREFIX.length).split(':').map(Number);
  if (!Number.isInteger(ids[0]) || !Number.isInteger(ids[1])) return null;
  return { key: k, ...record, a: record?.a ?? ids[0], b: record?.b ?? ids[1] };
};

export async function readProposal(conn, a, b) {
  const key = proposalKey(a, b);
  const row = await conn.get('SELECT k, v FROM meta WHERE k = ?', key);
  return row ? parseProposal(row.k, row.v) : null;
}

/** Every pending proposal, oldest first — the queue drains from the front. */
export async function readProposals(conn) {
  const rows = await conn.all(
    'SELECT k, v FROM meta WHERE substr(k, 1, ?) = ? ORDER BY k',
    PROPOSAL_PREFIX.length,
    PROPOSAL_PREFIX,
  );
  return rows
    .map((row) => parseProposal(row.k, row.v))
    .filter(Boolean)
    .sort((x, y) => (x.at ?? 0) - (y.at ?? 0) || (x.key < y.key ? -1 : 1));
}

export async function dropProposal(conn, key) {
  const existing = await conn.get('SELECT k FROM meta WHERE k = ?', key);
  if (!existing) return false;
  await conn.run('DELETE FROM meta WHERE k = ?', key);
  return true;
}

/**
 * Every proposal about one memory. `mem forget --hard` reuses ids (pairs.mjs), so
 * a proposal left behind by a purge would eventually name a memory that never had
 * anything to do with it.
 */
export const dropProposalsFor = (conn, id) => dropMetaFor(conn, id, PROPOSAL_PREFIX);

// ------------------------------------------------------------- the queue item --

const SCOPE_FILTERS = {
  all: () => true,
  project: (p, key) => p.scope === 'global' || p.project_key === key,
  'project-only': (p, key) => p.project_key === key,
  global: (p) => p.scope === 'global',
};

/**
 * A proposal as a queue item, or null if the world has moved past it.
 *
 * The item carries `memory` and `duplicate` in the shape a staged item uses, so
 * the existing renderer prints it without knowing what it is — the seam review.mjs
 * describes. `memory` is the row that would CHANGE (the one to be superseded,
 * merged away or demoted), because that is the row the reviewer is being asked
 * about; the counterpart hangs off `duplicate` where the "similar" column reads it.
 */
async function proposalItem(conn, proposal, { now = Date.now() } = {}) {
  const rows = await readRows(conn, [proposal.a, proposal.b]);
  const lo = rows.get(proposal.a);
  const hi = rows.get(proposal.b);
  if (!lo || !hi) return null;
  if (lo.status !== 'active' || hi.status !== 'active') return null;

  const stamps = proposal.stamps ?? {};
  const stale =
    stampOf(lo) > (stamps[lo.id] ?? -Infinity) || stampOf(hi) > (stamps[hi.id] ?? -Infinity);

  const subject = rows.get(proposal.loser ?? proposal.general ?? proposal.older) ?? lo;
  const other = subject.id === lo.id ? hi : lo;

  return {
    type: PROPOSAL_TYPE,
    ref: proposal.key,
    actions: ['promote', 'discard'],
    when: proposal.at ?? null,
    summary: subject.text,
    detail: proposal.why ?? null,
    memory: decorate(subject, now),
    duplicate: {
      id: other.id,
      uid: other.uid,
      text: other.text,
      similarity: proposal.similarity ?? 0,
      merges: proposal.action === 'merge',
    },
    proposal: {
      ...proposal,
      stale,
      // What promoting would do, in the words the CLI already prints.
      wants: describeAction(proposal, subject, other),
    },
  };
}

function describeAction(proposal, subject, other) {
  if (proposal.action === 'merge') return `merge #${subject.id} into #${other.id}`;
  if (proposal.action === 'supersede') return `retire #${subject.id}, superseded by #${other.id}`;
  if (proposal.action === 'refine') return `link #${other.id} as a refinement of #${subject.id}`;
  if (proposal.action === 'relate') return `link #${subject.id} and #${other.id} as related`;
  return `record the verdict for #${subject.id} and #${other.id} and change neither`;
}

/**
 * The review queue's consolidation source — PLAN: proposals go "into the same
 * review queue as staged captures, so `/mem:review` is the one triage surface".
 *
 * `promote` carries the proposal out; `discard` refuses it. There is no `edit`:
 * the thing being reviewed is a relationship between two memories, and editing
 * either of them is `mem review edit` on that memory, which already exists.
 */
export const consolidationProposals = {
  type: PROPOSAL_TYPE,

  async list(conn, { now = Date.now(), limit = 20, offset = 0, scope = 'all', projectKey = null } = {}) {
    const matches = SCOPE_FILTERS[scope] ?? SCOPE_FILTERS.all;
    const items = [];
    let total = 0;
    for (const proposal of await readProposals(conn)) {
      if (!matches(proposal, projectKey)) continue;
      const item = await proposalItem(conn, proposal, { now });
      // A stale proposal is hidden rather than deleted: listing is a read path,
      // and the next `mem consolidate` re-judges the pair and overwrites it.
      if (!item || item.proposal.stale) continue;
      total += 1;
      if (total > offset && items.length < limit) items.push(item);
    }
    return { items, total };
  },

  async resolve(conn, ref, { now = Date.now() } = {}) {
    const raw = String(ref ?? '').trim();
    const key = raw.startsWith(PROPOSAL_PREFIX)
      ? raw
      : /^(?:pair:)?\d+:\d+$/.test(raw)
        ? `${PROPOSAL_PREFIX}${raw.replace(/^pair:/, '')}`
        : null;
    if (!key) return null;

    const row = await conn.get('SELECT k, v FROM meta WHERE k = ?', key);
    if (!row) return null;
    const proposal = parseProposal(row.k, row.v);
    if (!proposal) {
      throw new ResolveError(`the proposal stored at '${key}' is unreadable.`, 'MEM_INVALID');
    }
    const item = await proposalItem(conn, proposal, { now });
    if (!item) {
      throw new ResolveError(
        `${key} is about a memory that is no longer active — re-run 'mem consolidate'.`,
        'MEM_STALE',
      );
    }
    return item;
  },

  /**
   * Accept the proposal. The guard is bypassed — the guard's whole purpose was to
   * get a human here, and a human is here — but staleness is not: the plan is
   * rebuilt from the rows as they are now and refused if either text has moved
   * since the judge saw it.
   */
  async promote(conn, item, { now = Date.now(), runId = null } = {}) {
    const { proposal } = item;
    if (proposal.stale) {
      throw new ResolveError(
        `${proposal.key} was proposed before one of those memories changed — ` +
          "re-run 'mem consolidate' to judge them again.",
        'MEM_STALE',
      );
    }
    const rows = await readRows(conn, [proposal.a, proposal.b]);
    const plan = planPair(
      {
        key: pairKey(proposal.a, proposal.b),
        a: proposal.a,
        b: proposal.b,
        similarity: proposal.similarity,
        scope: proposal.scope,
        project_key: proposal.project_key,
        rows: [rows.get(proposal.a), rows.get(proposal.b)],
      },
      { class: proposal.class, why: proposal.why, general: null },
      // Every class is auto here: the review IS the authorisation.
      { autoClasses: VERDICTS },
    );
    // The judge's own choice of the general side, not a re-derivation from length:
    // the proposal is what the human is agreeing to, so it is what runs.
    if (proposal.action === 'refine' && proposal.general && proposal.specific) {
      plan.action = 'refine';
      plan.general = proposal.general;
      plan.specific = proposal.specific;
    }

    const result = await applyPlan(conn, { ...plan, guard: null }, { now, runId });
    if (!result.ok) throw new ResolveError(`${proposal.key}: ${result.why}.`, 'MEM_STALE');
    await dropProposal(conn, proposal.key);
    return {
      ...result,
      action: result.action,
      ref: item.ref,
      type: item.type,
      id: item.memory.id,
      uid: item.memory.uid,
      accepted: true,
    };
  },

  /**
   * Refuse it. The pair's verdict stays cached, so it is not re-judged and not
   * re-proposed — a human has answered the question, and paying a judge to ask it
   * again next week is how a review queue trains people to ignore it. Restating
   * either memory brings the pair back, as it does everywhere else.
   */
  async discard(conn, item, { now = Date.now(), runId = null, reason = null } = {}) {
    const { proposal } = item;
    await dropProposal(conn, proposal.key);
    const eventId = await recordEvent(conn, {
      memoryId: proposal.a,
      event: EVENT_DECLINED,
      at: now,
      detail: {
        via: 'review',
        run_id: runId,
        pair: pairKey(proposal.a, proposal.b),
        class: proposal.class,
        action: proposal.action,
        reason,
        // The whole proposal, not just its class: dropping it is the only thing
        // this event does, so the record it dropped is the only thing an
        // inversion needs — and a `declined` that could not be undone would make
        // a mis-click on a queue of twenty the one irreversible action here.
        proposal,
      },
    });
    return {
      action: EVENT_DECLINED,
      ref: item.ref,
      type: item.type,
      id: item.memory.id,
      uid: item.memory.uid,
      text: item.memory.text,
      declined: proposal.action,
      eventId,
    };
  },
};

// ------------------------------------------------------------------ the pass --

/**
 * Detect, judge, resolve — tier 2 as one call.
 *
 * DRY RUN BY DEFAULT (PLAN: "`mem consolidate` dry-runs by default"), and the dry
 * run costs the LLM calls: what it cannot predict is the judgement, so a preview
 * that skipped it would preview nothing. What it skips is every write — no
 * resolution, no proposal, no verdict cached, no watermark — so running it twice
 * gives the same answer twice and neither run silences anything.
 *
 * THE WATERMARK IS STAMPED ONLY WHEN THE PASS WAS COMPLETE, which is pairs.mjs's
 * one rule: `consolidated_at` hides EVERY pair a row is in, judged or not, so a
 * pass that stamped after a truncated detection, a failed batch or a skipped
 * verdict would bury unjudged pairs until the row happened to change again. Four
 * conditions, all of them necessary: nothing truncated on either side of
 * detection, no batch errored, no pair went unjudged, and nothing was left
 * unhandled by a stale row.
 */
export async function consolidatePairs(
  conn,
  {
    now = Date.now(),
    runId = null,
    apply = false,
    autoClasses = AUTO_CLASSES,
    batchSize = JUDGE_BATCH,
    judge = judgePairs,
    // Anything the judge itself takes — model, env, a `run` — kept in its own bag
    // rather than spread, because every unrecognised option here goes to
    // `detectPairs` and a mis-spread `model` would silently change what is scanned.
    judgeOpts = {},
    stamp = true,
    margin = GUARD_CONFIDENCE_MARGIN,
    // Called once, immediately before the first write this pass makes, and never
    // at all if it makes none. That is exactly where PLAN's pre-run export
    // belongs and it is the one place it can go: before the judgement there is
    // nothing worth backing up (a dry run and an applying run detect the same
    // thing), and after the first UPDATE the copy is no longer "pre-run".
    onFirstWrite = null,
    ...detectOpts
  } = {},
) {
  const t0 = performance.now();
  const detected = await detectPairs(conn, { now, ...detectOpts });

  const report = {
    run_id: runId,
    now,
    apply,
    dry_run: !apply,
    threshold: detected.threshold,
    detected: {
      eligible: detected.eligible,
      candidates: detected.candidates,
      cached_skipped: detected.cached_skipped,
      fresh: detected.fresh,
      offered: detected.pairs.length,
      truncated: detected.truncated,
      changed: detected.changed,
    },
    calls: 0,
    judged: 0,
    by_class: Object.fromEntries(VERDICTS.map((v) => [v, 0])),
    planned: [],
    applied: [],
    proposed: [],
    skipped: [],
    unjudged: [],
    errors: [],
    stamped: null,
    ms: 0,
  };

  // Once, lazily, and only if something is actually about to be written.
  let firstWrite = null;
  const beforeWrite = async () => {
    if (!onFirstWrite || firstWrite !== null) return firstWrite;
    firstWrite = (await onFirstWrite(conn, report)) ?? true;
    return firstWrite;
  };

  // The watermark deliberately does NOT go through `beforeWrite`. It changes no
  // memory, it inverts from its own `consolidated` event, and a pass whose only
  // write is a stamp is the no-op case — backing that up would rotate the ten
  // most recent exports away in favour of the ten quietest weeks, which is
  // maintain.mjs's argument for the same decision.
  if (detected.pairs.length === 0) {
    if (apply && stamp) report.stamped = await stampIfComplete(conn, detected, report, { now, runId });
    report.ms = Math.round(performance.now() - t0);
    return report;
  }

  const judged = await judge(detected.pairs, { batchSize, now, ...judgeOpts });
  report.calls = judged.calls ?? 0;
  report.judged = judged.judged ?? 0;
  report.errors = judged.errors ?? [];
  report.unjudged = judged.unjudged ?? [];
  if (judged.unknown?.length) report.unknown = judged.unknown;
  if (judged.invalid?.length) report.invalid = judged.invalid;

  for (const pair of detected.pairs) {
    const verdict = judged.verdicts.get(pair.key);
    // No verdict, no action and NO CACHE ENTRY: an unjudged pair has to come back
    // next run, and a receipt would be the one thing that stops it.
    if (!verdict) continue;

    const plan = planPair(pair, verdict, { autoClasses, margin });
    report.by_class[plan.class] += 1;
    report.planned.push(plan);

    if (!apply) continue;

    if (plan.route === 'review') {
      await beforeWrite();
      await writeProposal(conn, plan, { now, runId });
      report.proposed.push({
        key: plan.key,
        class: plan.class,
        action: plan.action,
        guard: plan.guard,
        why: plan.why,
      });
      await cacheVerdict(conn, verdictRecord(plan, runId, now));
      continue;
    }

    // Before the UPDATE, not after it clears: a copy taken once the row has
    // already moved is not a copy of what was there. The cost of the other order
    // is an export for a pass that then found every row stale, which is a wasted
    // file and not a lost memory.
    await beforeWrite();
    const result = await applyPlan(conn, plan, { now, runId });
    if (!result.ok) {
      // The row moved between detection and now. Not an error and not a verdict:
      // leaving it uncached is what brings the pair back next run.
      report.skipped.push({ key: plan.key, class: plan.class, why: result.why });
      continue;
    }
    report.applied.push(result);
    await cacheVerdict(conn, verdictRecord(plan, runId, now));
  }

  if (apply && stamp) report.stamped = await stampIfComplete(conn, detected, report, { now, runId });
  report.ms = Math.round(performance.now() - t0);
  return report;
}

const verdictRecord = (plan, runId, now) => ({
  a: plan.a,
  b: plan.b,
  verdict: plan.class,
  similarity: plan.similarity,
  why: plan.why,
  runId,
  now,
});

/**
 * pairs.mjs's rule, as one predicate: stamp only rows whose candidate pairs were
 * ALL judged in this run. Reported rather than silent — a pass that could not
 * stamp has a backlog, and that is the number `mem stats` trends.
 */
async function stampIfComplete(conn, detected, report, { now, runId }) {
  const blockers = [];
  if (detected.truncated) blockers.push('more fresh pairs than one pass shows');
  if (detected.changed.truncated) blockers.push('more changed rows than one pass scans');
  if (report.errors.length > 0) blockers.push(`${report.errors.length} judge call(s) failed`);
  if (report.unjudged.length > 0) blockers.push(`${report.unjudged.length} pair(s) went unjudged`);
  if (report.skipped.length > 0) blockers.push(`${report.skipped.length} pair(s) could not be resolved`);
  if (blockers.length > 0) return { stamped: 0, blocked: blockers, ids: [] };

  const marked = await markConsolidated(conn, detected.examined_ids, { now, runId });
  return { ...marked, blocked: [] };
}

// ---------------------------------------------------------------- the undo --
//
// PLAN: "An LLM judge will get some calls wrong, and discovering it three weeks
// later with no undo is the failure mode that makes people abandon the system."
// maintain.mjs owns the `mem undo` command and tier 1's inversions; these are
// tier 2's, and they live here rather than there for the same reason the forward
// writes do — the file that knows what a `demoted` event meant is the file that
// wrote it.
//
// EVERY ONE OF THEM ASSERTS THE STATE IT IS ABOUT TO REVERSE, which is 5a.4's
// rule and matters more here than it did there. An undo runs against a store
// that kept living: the proposal may have been promoted by hand, the merged row
// restated by `mem add`, the link deleted, the pair judged again. Writing the old
// value over whatever is there now would make `undo` the thing that loses a
// memory, so an inversion that no longer fits returns `{ ok: false, why }` and
// changes nothing. What is not inverted is not recorded as undone, so re-running
// the same undo picks up exactly the rest.
//
// NOTHING HERE LOADS THE EMBEDDING MODEL either, and that is inherited rather
// than worked for: resolution never rewrites text, so no vector it left behind
// describes something that is no longer there. It is also why `unmerged` refuses
// outright on a `text` change — the only merge that moves text is write.mjs's
// dedup, which carries no run_id for an undo to find it by, and reverting the
// text without the vector would leave the row findable as the wrong memory.

/** Events this file and pairs.mjs write, and that the functions below reverse. */
export const CONSOLIDATION_INVERTIBLE = [
  EVENT_MERGED,
  EVENT_SUPERSEDED,
  EVENT_LINKED,
  EVENT_DEMOTED,
  EVENT_PROPOSED,
  EVENT_DECLINED,
  EVENT_PAIR_JUDGED,
  EVENT_CONSOLIDATED,
];

const same = (a, b) => (a ?? null) === (b ?? null);

/**
 * Put back the field values a merge wrote onto the survivor.
 *
 * All or nothing across the fields: a half-reverted merge — counts restored,
 * confidence kept — leaves the row in a state no run ever produced, which is
 * harder to reason about later than one the undo declined to touch.
 */
async function undoMerge(conn, event, { now, runId }) {
  const detail = event.detail ?? {};
  const changes = Array.isArray(detail.changes) ? detail.changes : [];
  const row = await conn.get('SELECT * FROM memories WHERE id = ?', event.memory_id);
  if (!row) return { ok: false, why: 'memory has been purged' };
  if (changes.some((c) => c.field === 'text')) {
    return { ok: false, why: 'that merge rewrote the text — its vector cannot be reverted from here' };
  }

  const moved = changes.filter((c) => !same(row[c.field], c.to));
  if (moved.length > 0) {
    return { ok: false, why: `${moved.map((c) => c.field).join(', ')} changed after the merge` };
  }
  if (changes.length === 0) {
    return { ok: true, action: 'unmerged', id: row.id, uid: row.uid, text: row.text, fields: 0, eventId: null };
  }

  await conn.run(
    `UPDATE memories SET ${changes.map((c) => `${c.field} = ?`).join(', ')} WHERE id = ?`,
    ...changes.map((c) => c.from),
    row.id,
  );
  const eventId = await recordEvent(conn, {
    memoryId: row.id,
    event: EVENT_UNMERGED,
    at: now,
    detail: {
      via: 'undo',
      run_id: runId,
      undoes_event: event.id,
      pair: detail.pair ?? null,
      restored: Object.fromEntries(changes.map((c) => [c.field, c.from])),
    },
  });
  return {
    ok: true,
    action: 'unmerged',
    id: row.id,
    uid: row.uid,
    text: row.text,
    fields: changes.length,
    eventId,
  };
}

/** Bring a superseded memory back — the inverse of both `merge` and `supersede`. */
async function undoSupersede(conn, event, { now, runId }) {
  const detail = event.detail ?? {};
  const row = await conn.get(
    'SELECT id, uid, text, status, superseded_by FROM memories WHERE id = ?',
    event.memory_id,
  );
  if (!row) return { ok: false, why: 'memory has been purged' };
  if (row.status !== 'superseded') return { ok: false, why: `status is now '${row.status}', not superseded` };
  // Somebody else's supersession, not this run's. Reversing it would overrule a
  // decision that is still standing.
  if (detail.by !== undefined && !same(row.superseded_by, detail.by)) {
    return { ok: false, why: `#${row.id} is superseded by #${row.superseded_by} now, not #${detail.by}` };
  }

  const previous = detail.previous ?? {};
  const status =
    STATUSES.includes(previous.status) && previous.status !== 'superseded' ? previous.status : 'active';
  await conn.run(
    'UPDATE memories SET status = ?, superseded_by = ? WHERE id = ?',
    status,
    previous.superseded_by ?? null,
    row.id,
  );
  // The event name and shape `mem forget --restore` writes, for 5a.3's reason:
  // one history read by one code path. `updated_at` stays put — it is the decay
  // clock, and a memory coming back is not the user restating it.
  const eventId = await recordEvent(conn, {
    memoryId: row.id,
    event: EVENT_RESTORED,
    at: now,
    detail: {
      via: 'undo',
      run_id: runId,
      undoes_event: event.id,
      pair: detail.pair ?? null,
      previous: { status: 'superseded', superseded_by: row.superseded_by ?? null },
    },
  });
  return { ok: true, action: 'restored', id: row.id, uid: row.uid, text: row.text, to: status, eventId };
}

/** Remove a `refines` / `related` row. The link is the state; nothing else holds it. */
async function undoLink(conn, event, { now, runId }) {
  const { src, dst, rel } = event.detail ?? {};
  if (!Number.isInteger(src) || !Number.isInteger(dst) || typeof rel !== 'string') {
    return { ok: false, why: 'event does not record which link it made' };
  }
  const present = await conn.get(
    'SELECT 1 AS found FROM memory_links WHERE src = ? AND dst = ? AND rel = ?',
    src,
    dst,
    rel,
  );
  if (!present) return { ok: false, why: 'the link is already gone' };

  await conn.run('DELETE FROM memory_links WHERE src = ? AND dst = ? AND rel = ?', src, dst, rel);
  const eventId = await recordEvent(conn, {
    memoryId: src,
    event: EVENT_UNLINKED,
    at: now,
    detail: { via: 'undo', run_id: runId, undoes_event: event.id, rel, src, dst },
  });
  return { ok: true, action: 'unlinked', id: src, rel, dst, eventId };
}

/** Put a refinement's salience notch back, if nothing has moved it since. */
async function undoDemote(conn, event, { now, runId }) {
  const detail = event.detail ?? {};
  const to = detail.previous?.salience;
  if (typeof to !== 'number') return { ok: false, why: 'event records no previous salience' };
  const row = await conn.get('SELECT id, uid, text, salience FROM memories WHERE id = ?', event.memory_id);
  if (!row) return { ok: false, why: 'memory has been purged' };
  if (!same(row.salience, detail.salience)) {
    return { ok: false, why: `salience is ${row.salience} now, not the ${detail.salience} this run set` };
  }

  await conn.run('UPDATE memories SET salience = ? WHERE id = ?', to, row.id);
  const eventId = await recordEvent(conn, {
    memoryId: row.id,
    event: EVENT_UNDEMOTED,
    at: now,
    detail: {
      via: 'undo',
      run_id: runId,
      undoes_event: event.id,
      salience: to,
      previous: { salience: row.salience },
    },
  });
  return { ok: true, action: 'undemoted', id: row.id, uid: row.uid, text: row.text, salience: to, eventId };
}

/** Withdraw a proposal this run parked for review. */
async function undoProposal(conn, event) {
  const detail = event.detail ?? {};
  if (!Number.isInteger(detail.a) || !Number.isInteger(detail.b)) {
    return { ok: false, why: 'event does not record which pair it proposed' };
  }
  const key = proposalKey(detail.a, detail.b);
  const row = await conn.get('SELECT k, v FROM meta WHERE k = ?', key);
  if (!row) return { ok: false, why: 'that proposal has already been promoted or discarded' };

  // A later run judged the pair again and overwrote the record. Withdrawing it
  // would delete a proposal this run never made.
  const current = parseProposal(row.k, row.v);
  if (current && detail.at !== undefined && !same(current.at, detail.at)) {
    return { ok: false, why: 'the proposal has been replaced by a later one' };
  }

  await conn.run('DELETE FROM meta WHERE k = ?', key);
  // No event. The `meta` row IS the proposal, its removal is in the `undone`
  // summary maintain.mjs writes, and a line on a memory nobody changed would be
  // noise in a log whose job is to explain why a memory looks like it does.
  return { ok: true, action: 'withdrew-proposal', id: detail.a, pair: key, eventId: null };
}

/** Put back a proposal a human declined. The event carries the whole record. */
async function undoDecline(conn, event) {
  const proposal = event.detail?.proposal;
  if (!proposal || !Number.isInteger(proposal.a) || !Number.isInteger(proposal.b)) {
    // A `declined` written before this slice carries only the class. There is
    // nothing to put back, and building a proposal out of the class alone would
    // park a plan no judge ever made.
    return { ok: false, why: 'event does not carry the proposal it declined' };
  }
  const key = proposalKey(proposal.a, proposal.b);
  const present = await conn.get('SELECT 1 AS found FROM meta WHERE k = ?', key);
  if (present) return { ok: false, why: 'a proposal for that pair is pending again' };

  const { key: _key, stale: _stale, ...record } = proposal;
  await conn.run(UPSERT_META, key, JSON.stringify(record));
  return { ok: true, action: 'restored-proposal', id: proposal.a, pair: key, eventId: null };
}

/**
 * Drop this run's verdict from the cache, or put back the one it replaced, so the
 * pair is offered for judging again.
 *
 * `cacheVerdict` records `previous: { verdict, at }` and not the whole entry, so a
 * restored one comes back without its rationale and without the similarity it was
 * given at. Both are commentary; `at` is the only field the detector's exclusion
 * reads, and that one is exact.
 */
async function undoVerdict(conn, event) {
  const detail = event.detail ?? {};
  if (!Number.isInteger(detail.a) || !Number.isInteger(detail.b)) {
    return { ok: false, why: 'event does not record which pair it judged' };
  }
  const key = pairKey(detail.a, detail.b);
  const row = await conn.get('SELECT k, v FROM meta WHERE k = ?', key);
  if (!row) return { ok: false, why: 'the verdict is already gone' };

  let current = null;
  try {
    current = JSON.parse(row.v);
  } catch {
    current = null;
  }
  if (current && detail.at !== undefined && !same(current.at, detail.at)) {
    return { ok: false, why: 'the pair has been judged again since' };
  }

  const previous = detail.previous;
  if (previous?.verdict && Number.isFinite(previous.at)) {
    await conn.run(
      UPSERT_META,
      key,
      JSON.stringify({
        a: detail.a,
        b: detail.b,
        verdict: previous.verdict,
        at: previous.at,
        similarity: null,
        why: null,
        run_id: null,
        restored_by_undo: true,
      }),
    );
    return {
      ok: true,
      action: 'restored-verdict',
      id: detail.a,
      pair: key,
      verdict: previous.verdict,
      eventId: null,
    };
  }

  await conn.run('DELETE FROM meta WHERE k = ?', key);
  return { ok: true, action: 'dropped-verdict', id: detail.a, pair: key, eventId: null };
}

/**
 * Wind the watermark back on the rows one pass stamped.
 *
 * Per row rather than all or nothing, because the rows are independent: a later
 * pass that re-stamped ten of four hundred is no reason to leave the other three
 * hundred and ninety hidden from detection. What it skipped is in the result.
 */
async function undoConsolidatedStamp(conn, event) {
  const detail = event.detail ?? {};
  const ids = (Array.isArray(detail.ids) ? detail.ids : []).filter((id) => Number.isInteger(id));
  if (ids.length === 0) return { ok: false, why: 'event records no stamped rows' };

  const rows = await conn.all(
    `SELECT id, consolidated_at FROM memories WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ...ids,
  );
  const previous = detail.previous ?? {};
  const skipped = [];
  let restored = 0;
  for (const row of rows) {
    if (!same(row.consolidated_at, detail.at)) {
      skipped.push(row.id);
      continue;
    }
    await conn.run('UPDATE memories SET consolidated_at = ? WHERE id = ?', previous[row.id] ?? null, row.id);
    restored += 1;
  }
  if (restored === 0) return { ok: false, why: `the watermark moved again on all ${rows.length} rows` };
  return { ok: true, action: 'unstamped', rows: restored, skipped, eventId: null };
}

/**
 * Invert one tier-2 event. `maintain.mjs`'s `undoOne` delegates here for every
 * name in `CONSOLIDATION_INVERTIBLE`, which is why this returns that function's
 * `{ ok, action, … } | { ok: false, why }` shape and never throws.
 */
export function undoConsolidation(conn, event, { now = Date.now(), runId = null } = {}) {
  const ctx = { now, runId };
  switch (event.event) {
    case EVENT_MERGED:
      return undoMerge(conn, event, ctx);
    case EVENT_SUPERSEDED:
      return undoSupersede(conn, event, ctx);
    case EVENT_LINKED:
      return undoLink(conn, event, ctx);
    case EVENT_DEMOTED:
      return undoDemote(conn, event, ctx);
    case EVENT_PROPOSED:
      return undoProposal(conn, event);
    case EVENT_DECLINED:
      return undoDecline(conn, event);
    case EVENT_PAIR_JUDGED:
      return undoVerdict(conn, event);
    case EVENT_CONSOLIDATED:
      return undoConsolidatedStamp(conn, event);
    default:
      return Promise.resolve({
        ok: false,
        why: `no inverse is implemented for '${event.event}'`,
        unsupported: true,
      });
  }
}
