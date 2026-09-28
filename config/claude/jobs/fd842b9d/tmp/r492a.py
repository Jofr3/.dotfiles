import io
p='docs/progress.md'
lines=io.open(p,encoding='utf-8').read().split('\n')
old6=lines[5]
assert old6.startswith('**Last updated:** 2026-09-08 — build session #431')
new6=('**Last updated:** 2026-09-10 — build session #432 (**P3-M5 — D492, *the filtered whole-side '
 'spread — and MY CONFIDENT CLAIM THAT THE TAIL WAS NOT A BLOCKER WAS HALF FALSE.*** Built corpus '
 '**file lines 616 and 539**, *"This attack does {60|100} damage to each of your opponent\'s Pokémon '
 'ex[ and Pokémon V]. This attack\'s damage isn\'t affected by Weakness or Resistance."* — **2 '
 'sentences / 4 legal printings**, one slice, **and `COMPOUND-tail` IS NOW ZERO ROWS IN THE '
 'RESIDUE.** 🛑 **THE TAIL IS A BLOCKER AND THE INSTRUMENT COULD NOT SEE IT.** I briefed, '
 'confidently, that `residue-census.ts`\'s CUT experiment proved the head was the whole of it. '
 'Measured: substituting the FILTER alone gives *"…does 100 damage to each of your opponent\'s '
 'Pokémon. This attack\'s damage isn\'t affected by Weakness or Resistance."*, which is **REFUSED by '
 'all 13 and all 4 splitters**, while the same head under D482\'s PARENTHETICAL builds. **The CUT '
 'experiment runs one direction only — it asks whether the remainder builds, never whether the '
 'remainder COMPOSES** (D466: `splitAttackTrailingClause` requires the tail to be a '
 '`deriveAttackEffect` clause, and a W/R suppression is a DAMAGE reader\'s). **Two blockers, both '
 'rows carry both**, and a build on "the head is the whole of it" would have shipped an anchor that '
 'left both rows in the residue. **THE 2⁵ LATTICE IS IDENTICAL AT ALL 32 POINTS FOR BOTH ROWS** — so '
 'they are one slice by measurement (D488) — with **the single weight-2 point that builds being '
 'FILTER + TAIL TOGETHER**, and per-axis flip counts `amount 0, form 4, scope 0, filter 4, tail 4`: '
 '**five axes, two of which do no work**, SCOPE being DEGENERATE in D491\'s sense because the whole '
 'side has built since D482. **612/613 do NOT join the cluster** — already built, sharing the '
 'vocabulary and nothing else; the preposition is a different seam (a fold at DECLARATION versus a '
 'spread inside the program). 🛑 **AND D482\'s COMPOSITION DOES NOT TRANSFER — BOTH REASONS KILL IT '
 'INDEPENDENTLY**: `damageDefender` carries no `ignoreWR`, so the composition reads **200 where the '
 'print reads 100**; and it has no filter, so it damages a non-`ex` Active, reading **100 where the '
 'print reads 0**. What it is instead is `snipeTargets` + `placeSnipe`, which already narrow '
 '`oppAnyRefs` by D483\'s filter — **the only gap was the printed *"each of"*, i.e. `count: number | '
 '"all"`.** ⚠️ **THE COLLISION BOARD IS REAL AND IS BROKEN BY ONE BYTE, NOT BY BOARD SIZE**: on an '
 'Active `ex` with **no Weakness** and no benched `ex`, *"damage TO each"* and *"damage FOR each"* '
 'both answer `[60, 0]` — **a Weakness ×2 on that same one-body board splits them 60 vs 120.** '
 '**ONE anchor, ONE arm, ONE two-key shortlist, ONE widened quantifier, ONE interpreter local, ONE '
 '`cardplay.ts` conjunct**; **ZERO** new `EffectOp`/`CardFilter`/`DamageCountSource` members, readers '
 '(**13**), prompts, parks, events, error codes, state fields, registry rows, `redact.ts`, `log.ts` '
 'or `packages/schema` bytes — **the only engine-source deletions in the whole slice are THREE '
 'LINES**. `MATCH_RECORD_VERSION` **29 on D125\'s WIDENING** — a REQUIRED field gaining a new '
 'INHABITANT — **with reachability TRUE but deliberately NOT the argument** (D463: pick the shape '
 'that is true; D450: reachability alone reads as an excuse). ⚠️ **THE BUILDER CAUSED AND CAUGHT A '
 'MECHANICAL-PASS FAILURE**: a repo-wide `toBe(24) → toBe(28)` over-patched 7 sites in 6 files, and '
 'the obvious "revert" **is not an inverse** — it rewrote every `toBe(28)`, breaking **9 pre-existing '
 'assertions that had legitimately been 28**. Caught by reading `git diff -U0`, **not by any test**, '
 'because the suite stayed green through the over-patch. Repaired line-by-line; verified at ritual '
 'time by paired diff analysis — `toBe(24)` net −1 and `toBe(28)` net +1, exactly the one intended '
 'census step. Engine **0.386.0 → 0.387.0**. Corpus **2,361 → 2,373**, archive ratchet **162**. `bun '
 'run check` GREEN, **478 files / 10,895 tests**, `it(` delta **+33 EXACT**. Residue **90/127 → '
 '88/123**, `OPAQUE` **UNCHANGED at 65/94**, `BUILT.attack` **1605 → 1609**.)')
lines[5]=new6
lines.insert(7,'**Last updated (was):** '+old6.split('**Last updated:** ',1)[1])
lines.insert(8,'')
io.open(p,'w',encoding='utf-8').write('\n'.join(lines))
print('ok')
