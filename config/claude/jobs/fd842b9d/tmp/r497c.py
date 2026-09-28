import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D496,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D497, *guarding '
 'the oracle the whole loop trusts, and the brief\'s central claim was false*: `surface()` — what '
 '`attackReaderSurface()` returns — had ZERO mutant rows, but the "no contents/order witness" claim '
 'was wrong (~50 order-sensitive `toEqual` sites exist), so this was DRIVEN-BUT-UNPINNED and the rows '
 'were the missing MEASUREMENT, not a missing guard. The sort is a LOADER-DEPENDENT no-op — '
 'spec-sorted under Bun, declaration-ordered under vitest. Dropping the prefix conjunct takes the '
 'residue to ZERO, silently. No sentence built; residue, `BUILT.attack`, census and engine version '
 'all UNMOVED**; corpus 2,418 → 2,424, survivors 44 → 46, check GREEN 481/10,969) |')
s=s[:i]+new_row+s[j:]
log_anchor='### 2026-09-11 — build session #436 (P3-M5 — D496)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-11 — build session #437 (P3-M5 — D497)

**GUARDING THE ORACLE THE WHOLE LOOP TRUSTS — AND MY CENTRAL CLAIM WAS FALSE IN THE DIRECTION THAT
WOULD HAVE WASTED THE SLICE.** Second consecutive COVERAGE slice. Engine **0.390.0, NOT BUMPED**;
**`MATCH_RECORD_VERSION` 29**; corpus **2,418 → 2,424**; declared survivors **44 → 46**; archive
ratchet **166 → 167**; `bun run check` GREEN at **481 files / 10,969 tests — UNCHANGED**, correctly,
because the slice adds zero `it(` blocks.

**(0) WHAT DID NOT MOVE, VERIFIED RATHER THAN ASSERTED.** `git diff --name-only` is **exactly one
file** — `scripts/mutation/mutants.ts` — and `git diff -U0` contains no `engineVersion`, no
`MATCH_RECORD_VERSION` and no `0.390.0`. **Residue 85 / 120, `BUILT.attack` 1612, `OPAQUE` 63 / 92,
census standing still, no census tax.**

**(1) THE TARGET.** `surface()` in `censusAttackCorpus.ts` — what `attackReaderSurface()` returns,
and **the oracle every slice since roughly D480 has used to derive build state**. Measured by span
with all **2,418** `find` strings resolved: **ZERO rows** in `surface()`, **ZERO** in
`attackReaderSurface()`, and ⚠️ **ZERO in `resolvedByAnyReader()`, which my brief never measured.**

**(2) 🛑 MY LOAD-BEARING CLAIM WAS FALSE.** I wrote, confidently: *"I found NO assertion anywhere on
sortedness or on the exact contents — only on length."* **Measured: ~50 ORDER-SENSITIVE contents
assertions**, spelled `expect(<names>.sort()).toEqual(attackReaderSurface())` — and `toEqual` on
arrays **is** order-sensitive, so a sorted left-hand side pins order **and** membership. Verified
independently at ritual time: **49 files by exact pattern**, plus exactly **2** sites that re-sort
and are therefore blind to order by construction. ⚠️ **Had the builder obeyed the brief it would have
"fixed" a witness that already existed and shipped a redundant rung.** **The correct diagnosis is
D474's DRIVEN-BUT-UNPINNED**: the witnesses existed and had never been *measured*, so **the rows are
the missing measurement, not the missing guard** — and consistent with that, **no row survived for a
suite-gap reason and there is no GAP to report.**

**(3) 🛑 THE FINDING: THE ORACLE'S SORT IS A LOADER-DEPENDENT NO-OP.** `Object.entries` on an ES
module namespace is **spec-sorted under Bun's native ESM** and **declaration-ordered under
vite/vitest's SSR transform** — same bytes, different answer. **Verified at ritual time**: under Bun,
`Object.keys(effects)` order **=== sorted**, so `found.sort(…)` is a **no-op there**, while under
vitest it is real behaviour. **And this repo reads the surface under BOTH** — suites under vitest,
`scripts/residue-census.ts` under Bun. One row exists precisely to pin that difference, and it goes
equivalent if anyone alphabetises `effects.ts`.

**(4) THE DAMAGE IS NOT THE COUNT, AND IT WAS MEASURED.** 86 files assert on the surface with ~90
length pins, so anything changing the count dies instantly — which is why the live attack surface is
what **preserves** it. Dropping the prefix conjunct takes the oracle **13 → 25** and
`resolvedByAnyReader` from **529 / 640 sentences claimed to 640 / 640 — the residue goes to ZERO.**
**The sort is what makes that silent**: an enrolled export sorts first and answers non-null, so
`.some` short-circuits before reaching three enrolled exports that **throw**.

**(5) SIX ROWS, EACH WITH ITS KILLING ASSERTION MEASURED** by applying the mutation and reading the
**first** failure. ⚠️ **The controls are the point**: for the two ORDER rows, the length-only suite is
GREEN and the re-sorting suite is GREEN — **so a killer set assembled from length-only suites would
have let both order rows survive and reported a gap that does not exist.** ⚠️ **And the brief's
"check for a second consumer" hazard MATERIALISED**: `surface()` has exactly two consumers, and one
row's first kill arrives through `resolvedByAnyReader`, not through the length rung it was aimed at.

**(6) TWO DECLARED SURVIVORS, BOTH `--full`-VERIFIED AND BOTH WITH THEIR KIND NAMED.** Confirmed
GREEN over **481 files / 10,969 tests** rather than under a `--decision` probe, because both reasons
quantify over a population (D477). **`unreachable-population`** — zero non-function exports carry the
name, so the `typeof` conjunct refuses nothing; **self-invalidating**, KILLED the day one does, and
it is the **one-axis control** for the prefix row: same conjunction, other half dropped, and that one
dies. 🆕 **And a THIRD kind of equivalence — PURITY**: a memo over an input fixed at load is neither
D468's structural nor D467's guarded disjointness, **with its falsifier CHECKED rather than assumed**
(`grep` for `vi.mock`/`vi.spyOn` across the engine returns **0**, so nothing can stub the namespace
mid-run).

**(7) THE REGION IS THINNER THAN IT LOOKS, STATED WITH THE MEASUREMENT.** Seven candidate mutations
exist on 16 lines and **three are unobservable today**. The seventh (`startsWith` → `includes`) was
**deliberately not shipped** — equivalent at 13 → 13, same order, probed green in five suites — with
the reasoning recorded so a successor need not re-derive it. Also declined with reasons: the
realistic memo slips all leave `return SURFACE` answering `null` and die by TypeError everywhere,
**measuring the language rather than the code** (D440).

**(8) ⚠️ AND A GAP I NEVER MEASURED IS NAMED AS DEBT.** **`resolvedByAnyReader()` carries ZERO mutant
rows** — the predicate behind every residue and `BUILT.attack` figure in the repo. Its interesting
mutations were **named and deliberately not guessed at**, because guessing a killer set is the
row-that-dies-for-a-reason-nobody-checked failure: `.some` → `.every`, `!== null` → `!== undefined`,
and especially **`!== null` → `!= null`, which is probably equivalent today and is a strictly better
guard than what ships.** Priced at one slice.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
