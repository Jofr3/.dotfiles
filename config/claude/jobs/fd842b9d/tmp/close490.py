import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_tail=("Residue **92/130 → 91/128**, `OPAQUE` **66/96 → 65/94**, `BUILT.attack` "
 "**1602 → 1604**.)")
assert s.count(old_tail)==1
new_tail=("Residue **92/130 → 91/128**, `OPAQUE` **66/96 → 65/94**, `BUILT.attack` "
 "**1602 → 1604**. ✅ **WHOLE-CORPUS SWEEP GREEN AND EXACTLY AS PREDICTED: `2306 killed · 43 known "
 "survivor(s) · 0 GAP(s) · 0 stale · 0 skipped(dirty) · 0 clobber(s) · 0 error(s) · 9,742.8s`** — "
 "`+17 killed, +1 declared`, the **fifty-first** consecutive slice to commit its number before the "
 "run and hit it, **and the first in this run of slices whose prediction had to move the "
 "declared-survivor term** (42 → 43). Completeness structural: **2,349 unique progress-line ids / "
 "2,349 rows / 0 unmatched**, **fifty-second** consecutive clean run. Launched detached with "
 "`setsid` per D489 and it ran uninterrupted.)")
s=s.replace(old_tail,new_tail,1)

old0='''> 🛑 **(0) THE DEBT: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/eachDeckMillBoost.test.ts`.** `git add` EXPLICIT
> PATHS. 🛑 **AND LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489): two tracked background runs were
> SIGTERMed within minutes of the turn ending; a detached run reparents to init (PPID 1) and
> survives. **A detached run sends no completion notification — POLL the summary line.**'''
assert s.count(old0)==1
new0='''> ✅ **(0) THE DEBT IS PAID.** D490 is committed (`4d226db4`) with explicit paths — the untracked
> `packages/engine/src/eachDeckMillBoost.test.ts` was named and staged by name — and the whole-corpus
> sweep ran against a CLEAN tree: `2306 killed · 43 known survivor(s) · 0 GAP(s) · 0 stale ·
> 0 skipped(dirty) · 0 clobber(s) · 0 error(s) · 9,742.8s`, tree clean at exit. **EXACTLY the
> predicted line — fifty-first consecutive slice to name its number first and hit it**, and the first
> in this run whose prediction had to move the **declared-survivor** term rather than only the killed
> one. Completeness re-derived from unique progress-line ids: **2,349 / 2,349 / 0 unmatched**, 18 of
> them D490's — **fifty-second consecutive clean run**.
>
> ✅ **D489's `setsid` FIX HELD ON ITS FIRST REUSE.** Launched detached, PPID 1, it ran the full
> 9,742.8 s uninterrupted where the two tracked runs before it were SIGTERMed inside minutes. The
> polling discipline it forces (read the summary line, not a verdict tally) worked unchanged.
>
> 🛑 **(0-prior) THE DEBT AS IT WAS WRITTEN: COMMIT FIRST, THEN THE WHOLE-CORPUS SWEEP.**
> ⚠️ **ONE UNTRACKED PATH: `packages/engine/src/eachDeckMillBoost.test.ts`.** `git add` EXPLICIT
> PATHS. 🛑 **AND LAUNCH THE SWEEP DETACHED WITH `setsid`** (D489): two tracked background runs were
> SIGTERMed within minutes of the turn ending; a detached run reparents to init (PPID 1) and
> survives. **A detached run sends no completion notification — POLL the summary line.**'''
s=s.replace(old0,new0,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
