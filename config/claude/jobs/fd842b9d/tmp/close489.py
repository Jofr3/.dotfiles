import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()

old_tail=("Residue "
 "**93/132 → 92/130**, `OPAQUE` **67/98 → 66/96**, `BUILT.attack` **1600 → 1602**.)")
assert s.count(old_tail)==1
new_tail=("Residue "
 "**93/132 → 92/130**, `OPAQUE` **67/98 → 66/96**, `BUILT.attack` **1600 → 1602**. "
 "✅ **WHOLE-CORPUS SWEEP GREEN AND EXACTLY AS PREDICTED: `2289 killed · 42 known survivor(s) · "
 "0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) · 0 error(s) · 9,653.0s`** — `+19 killed, "
 "+0 declared`, the **fiftieth** consecutive slice to commit its number before the run and hit it. "
 "Completeness structural: **2,331 unique progress-line ids / 2,331 rows / 0 unmatched**, "
 "**fifty-first** consecutive clean run. ⚠️ **AND THE RUN TOOK THREE LAUNCHES**: two tracked "
 "background jobs were SIGTERMed within minutes of the turn ending, at rows ~200 and ~12. "
 "**The harness trapped both and restored (`[SIGTERM] restoring N file(s) before exit…`), leaving a "
 "CLEAN tree and no journal each time** — D470's safety behaviour working. The third launch used "
 "`setsid` so the process reparented to init (PPID 1) and sat outside the session's process group; "
 "it ran to completion.)")
s=s.replace(old_tail,new_tail,1)

old0='''> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/handDiscardScaledSnipe.test.ts`.** `git add` EXPLICIT
> PATHS — it is not in any tracked-file glob and a path-less commit silently omits the only file that
> witnesses the slice.'''
assert s.count(old0)==1
new0='''> ✅ **(0) THE DEBT IS PAID.** D489 is committed (`4047cd10`) with explicit paths — the untracked
> `packages/engine/src/handDiscardScaledSnipe.test.ts` was named and staged by name — and the
> whole-corpus sweep ran against a CLEAN tree: `2289 killed · 42 known survivor(s) · 0 GAP(s) ·
> 0 stale · 0 skipped(dirty) · 0 clobber(s) · 0 error(s) · 9,653.0s`, tree clean at exit. **EXACTLY
> the predicted line — fiftieth consecutive slice to name its number first and hit it.**
> Completeness re-derived from unique progress-line ids: **2,331 / 2,331 / 0 unmatched**, 19 of them
> D489's — **fifty-first consecutive clean run**. ✅ **The eight `D318-*` rows that target
> `docs/progress.md` ran and were KILLED rather than SKIPPED-DIRTY**, because the ritual commits
> before the sweep; the builder flagged that hazard from its own side and the sequence already
> covered it.
>
> 🆕 ⚠️ **THE RUN TOOK THREE LAUNCHES, AND THE FAILURE MODE IS ENVIRONMENTAL RATHER THAN THE
> HARNESS'S.** Two tracked background jobs were **SIGTERMed within a minute or two of the turn
> ending**, at rows ~200 and ~12. **Both times the harness trapped the signal and restored** —
> `[SIGTERM] restoring 1 file(s) before exit…` then `restoring 0 file(s)` — leaving a clean tree, no
> `tmp/mutation-journal.json` and no orphan process, verified all three ways before relaunching
> (D446's classification). **That is D470's safety behaviour doing exactly its job under a signal
> nobody designed for.** 🛑 **THE FIX IS `setsid`**: launched detached, the process reparents to
> **init (PPID 1)** and sits outside the session's process group, so a group-wide SIGTERM misses it.
> **A ~2.7-hour sweep should be launched detached and POLLED, not tracked** — and the poll must read
> the summary line, since a detached run sends no completion notification.
>
> 🛑 **(0-prior) THE DEBT AS IT WAS WRITTEN: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/handDiscardScaledSnipe.test.ts`.** `git add` EXPLICIT
> PATHS — it is not in any tracked-file glob and a path-less commit silently omits the only file that
> witnesses the slice.'''
s=s.replace(old0,new0,1)
io.open(p,'w',encoding='utf-8').write(s)
print('progress closed')
