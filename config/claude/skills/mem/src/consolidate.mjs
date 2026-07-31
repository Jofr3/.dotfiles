// Tier 2, as one run — PLAN's "Reversibility is non-negotiable", applied to the
// half of the system that needs judgement.
//
//   Every consolidation run gets a `run_id`; every action writes a
//   memory_events row carrying enough prior state to invert it.
//   `mem undo <run_id>` reverses an entire run.
//   `mem consolidate` **dry-runs by default**; `--apply` applies only auto-safe
//   classes (duplicates); contradictions always route through `/mem:review`.
//   Automatic pre-run JSONL export to the data dir, last 10 kept.
//
// Four sentences, and this file is the fourth column of each: pairs.mjs finds the
// pairs, judge.mjs classifies them, resolve.mjs decides and writes — and none of
// those three knows what a *run* is. That is what is here, and it is deliberately
// thin. Everything with a decision in it lives in the file that owns the decision.
//
// THE DEFAULT IS THE OPPOSITE OF `mem maintain`'S, AND THAT IS THE POINT. Tier 1
// applies by default because it fires detached from a hook where a dry run would
// print to a pipe nobody reads. Tier 2 is spawned by a person or a weekly cron,
// its actions are taken on the word of a language model, and the failure it can
// produce — a true memory retired because a judge misread a refinement — is
// invisible from the outside. So it previews, and applying is something somebody
// asks for.
//
// THE DRY RUN STILL PAYS FOR THE LLM CALLS. What it cannot predict is the
// judgement, so a preview that skipped it would be a preview of nothing; what it
// skips is every write, including the verdict cache and the watermark, so running
// it twice gives the same answer twice and neither run silences a pair.
//
// NO LOCK, unlike tier 1, and for a reason rather than an omission. A maintenance
// pass is a background process that could fire while another one is halfway
// through the same ladder; this is a foreground command whose every write
// re-reads its rows first and refuses on anything that moved (resolve.mjs's
// `applyPlan`). Two consolidations racing produce one set of resolutions and one
// set of `could not be resolved` lines, which is the honest outcome — and a lock
// here would instead make `mem consolidate` fail while a SessionStart hook it
// cannot see holds it.
//
// Timestamps are epoch milliseconds throughout, matching write.mjs.

import { existsSync } from 'node:fs';

import { openDb } from './db.mjs';
import { judgePairs } from './judge.mjs';
import {
  BACKUP_KEEP,
  CONSOLIDATION_MIN_INTERVAL_MS,
  EVENT_CONSOLIDATION,
  META_LAST_CONSOLIDATION,
  NEW_MEMORY_THRESHOLD,
  backupDir,
  backupIfMigrationPending,
  countNewSince,
  dueForConsolidation,
  newRunId,
  readLastRun,
  writeBackup,
  writeLastRun,
} from './maintain.mjs';

/**
 * The throttle lives in maintain.mjs, for the reason written on
 * `EVENT_CONSOLIDATION` there: tier 1 has to be able to say whether tier 2 is due
 * without importing the module that imports it. Re-exported here because this is
 * the file the throttle is *about*, and `MIN_INTERVAL_MS` reads as a week from
 * inside it.
 */
export {
  META_LAST_CONSOLIDATION,
  NEW_MEMORY_THRESHOLD,
  countNewSince,
  dueForConsolidation,
  CONSOLIDATION_MIN_INTERVAL_MS as MIN_INTERVAL_MS,
};
import { resolvePaths } from './paths.mjs';
import { AUTO_CLASSES, consolidatePairs } from './resolve.mjs';
import { recordEvent } from './write.mjs';

/**
 * Run ids say which tier made them: `cons-20260731T091205-4a71bd`. Slice 5a.4
 * left the note — "Phase 5b's runs will not say `maint`" — because `mem undo
 * --list` is read by somebody deciding what to reverse, and "the archiving pass"
 * and "the judged pass" are different questions.
 */
export const RUN_PREFIX = 'cons';

/**
 * PLAN's letter: "`--apply` applies only auto-safe classes (duplicates)".
 * resolve.mjs ships one step wider (duplicates plus the three keep-both classes,
 * with the argument written out there); this is the narrowing `--duplicates-only`
 * selects, and it costs nothing but extra review items.
 */
export const DUPLICATES_ONLY = ['duplicate'];

export class ConsolidateError extends Error {
  constructor(message, code = 'MEM_INVALID') {
    super(message);
    this.name = 'ConsolidateError';
    this.code = code;
  }
}

const round = (ms) => Math.round(ms * 10) / 10;

/**
 * One consolidation pass: detect, judge, resolve or propose, under one run id.
 *
 * `conn` is accepted so tests and callers that already hold a handle can drive it
 * without path resolution; everything else — the migration copy, the pre-run
 * export, the store path in the report — is keyed on `paths.dbPath` either way.
 */
export async function consolidate({
  paths = resolvePaths(),
  env = process.env,
  conn: given = null,
  now = Date.now(),
  apply = false,
  runId = null,
  backup = true,
  keepBackups = BACKUP_KEEP,
  judge = judgePairs,
  judgeOpts = {},
  autoClasses = AUTO_CLASSES,
  duplicatesOnly = false,
  force = false,
  minIntervalMs = CONSOLIDATION_MIN_INTERVAL_MS,
  newThreshold = NEW_MEMORY_THRESHOLD,
  ...opts
} = {}) {
  const t0 = performance.now();
  const id = runId ?? newRunId(now, { prefix: RUN_PREFIX });

  // Fail before the scan rather than once per batch. detectPairs is the
  // quadratic part of this pass and there is nothing to detect *for* on a machine
  // that has opted out of spawning the judge.
  if (judge === judgePairs && env.MEM_NO_LLM === '1') {
    throw new ConsolidateError(
      'MEM_NO_LLM=1 — consolidation needs `claude -p` to classify pairs. ' +
        'Unset it, or use `mem pairs` to see what would be judged.',
      'MEM_NO_LLM',
    );
  }

  if (!given && !existsSync(paths.dbPath)) {
    throw new ConsolidateError(`no store at ${paths.dbPath} yet — nothing to consolidate.`, 'MEM_NOT_FOUND');
  }

  // Before the writable open, because the writable open is what migrates —
  // maintain.mjs's argument, and it applies to any background-ish write path.
  const migrationBackup =
    given || !apply || !backup ? null : await backupIfMigrationPending({ paths, env, runId: id, keep: keepBackups });

  // A dry run must not migrate either: `--dry-run` has to be safe to type, and
  // opening writably to preview something is the one way a preview can change a
  // store. `mem pairs` opens the same way.
  const conn =
    given ?? (await openDb({ paths, env, ...(apply ? {} : { readonly: true, runMigrations: false }) }));

  try {
    // Before the detection scan, and therefore before the judge: a throttled
    // scheduled run has to cost nothing, or the throttle is only saving writes.
    const last = await readLastRun(conn, META_LAST_CONSOLIDATION);
    const newSince = await countNewSince(conn, last?.at ?? null);
    const due = dueForConsolidation({ lastAt: last?.at ?? null, now, newSince, minIntervalMs, newThreshold });

    if (apply && !due.due && !force) {
      return {
        run_id: id,
        store: paths.dbPath,
        now,
        // `throttled`, not tier 1's `skipped: 'throttled'`: `skipped` is already
        // the list of pairs this pass could not resolve, and overloading it with
        // a status string would hand every caller that reads `.length` a 9.
        throttled: true,
        why: due.why,
        due,
        last_run: last,
        next_at: due.nextAt,
        applied: [],
        proposed: [],
        skipped: [],
        // The rest of a report's shape, empty. A throttled pass is still a
        // consolidation report and every caller reads it as one — bin/mem's exit
        // code is `report.errors.length`, and a missing key there is a crash on
        // the one path whose whole promise is that it does nothing.
        planned: [],
        errors: [],
        unjudged: [],
        judged: 0,
        calls: 0,
        by_class: {},
        counts: { applied: 0, proposed: 0, skipped: 0, judged: 0, calls: 0 },
        backup: null,
        migration_backup: migrationBackup,
        backups_dir: backupDir(paths),
        elapsed_ms: round(performance.now() - t0),
      };
    }

    let backupReport = null;
    const report = await consolidatePairs(conn, {
      now,
      runId: id,
      apply,
      autoClasses: duplicatesOnly ? DUPLICATES_ONLY : autoClasses,
      judge,
      judgeOpts,
      // PLAN: "Automatic pre-run JSONL export to the data dir, last 10 kept."
      // Fired once, after the judgement and before the first write — see the
      // note on `onFirstWrite` in resolve.mjs for why that is the only moment
      // both halves of "pre-run" are true.
      onFirstWrite:
        apply && backup
          ? async (handle) => {
              backupReport = await writeBackup(handle, { paths, runId: id, keep: keepBackups });
              return backupReport;
            }
          : null,
      ...opts,
    });

    const summary = {
      applied: report.applied.length,
      proposed: report.proposed.length,
      skipped: report.skipped.length,
      judged: report.judged,
      calls: report.calls,
    };

    if (apply) {
      // Written every applying pass, including the one that changed nothing: it
      // is what `mem undo --list` and `mem stats` count, and a tier that only
      // recorded the weeks it acted would look dead in exactly the weeks it was
      // working correctly.
      await recordEvent(conn, {
        memoryId: null,
        event: EVENT_CONSOLIDATION,
        at: now,
        detail: {
          run_id: id,
          at: now,
          counts: summary,
          by_class: report.by_class,
          backup: backupReport?.path ?? null,
          stamped: report.stamped?.stamped ?? 0,
        },
      });

      // Every applying pass moves it, including the one that judged nothing —
      // the throttle is about how often the *judge* is asked, and a pass that
      // found no pairs has asked and been answered. Leaving it unmoved would
      // re-scan on the next session forever on a store with nothing to do.
      await writeLastRun(
        conn,
        { at: now, run_id: id, counts: summary },
        META_LAST_CONSOLIDATION,
      );
    }

    return {
      ...report,
      run_id: id,
      store: paths.dbPath,
      due,
      last_run: last,
      auto_classes: duplicatesOnly ? DUPLICATES_ONLY : autoClasses,
      counts: summary,
      backup: backupReport,
      migration_backup: migrationBackup,
      backups_dir: backupDir(paths),
      elapsed_ms: round(performance.now() - t0),
    };
  } finally {
    if (!given) await conn.close().catch(() => {});
  }
}
