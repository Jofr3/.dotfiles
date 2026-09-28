import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D500,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D501, *the raised '
 'Confusion self-hit — THE FIRST `MATCH_RECORD_VERSION` BUMP OF THE RUN (29 → 30), owed rather than '
 'chosen*: a REQUIRED key at a persisted address whose REST CANNOT WITNESS its absence — a v29 record '
 'computes `damage + undefined` → NaN, so the body can never be Knocked Out again on a board that '
 'looks normal. The optional road was refused because it would have DISARMED two shipped `satisfies` '
 'guards. And the HUD was printing a false "30 damage" to players at decision time. 1 sentence / 1 '
 'printing**; engine 0.393.0, corpus 2,464, check GREEN 484/11,064) |')
s=s[:i]+new_row+s[j:]
log_anchor='### 2026-09-11 — build session #440 (P3-M5 — D500)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-11 — build session #441 (P3-M5 — D501)

**THE RAISED CONFUSION SELF-HIT — THE FIRST `MATCH_RECORD_VERSION` BUMP OF THE RUN, OWED AND PAID,
AND A FALSE NUMBER THE HUD WAS SHOWING PLAYERS AT DECISION TIME.** Engine **0.392.0 → 0.393.0**,
**`MATCH_RECORD_VERSION` 29 → 30**, corpus **2,446 → 2,464**, declared survivors **48 UNCHANGED**,
archive ratchet **170 → 171**, `bun run check` GREEN at **484 files / 11,064 tests**.

**(0) THE BUILD.** Corpus **line 685**, 1 printing: **REFUSED 13/13** with all four splitters null,
now `[{applyStatus, defender, confused, confusionDamage: 80}]`. **All three `instead of` rows are now
claimed** — the two Poison ones already built, carried by `applyStatus.poisonDamage`.

**(1) 🛑 THE BUMP IS OWED RATHER THAN CHOSEN, AND THE ADDRESS WAS NAMED FIRST.** `SpecialConditions`
⊂ `InPlayPokemon.conditions` ⊂ `PlayerState` ⊂ `GameState.players` ⊂ **`MatchRecord.state`** —
persisted on every save **with no park in front**, driven rather than grepped (`JSON.stringify(state)`
contains the key). **So reachability (D450), serialized-alphabet (D462) and no-carrier (D498) are all
INAPPLICABLE, and none was used** — the three arguments that held 29 for the last four slices.

**(2) ⚠️ AND MY CENTRAL INSTRUCTION WAS UNANSWERABLE.** I wrote: *"check what `poisonDamage` did about
this — it is the shipped precedent at the same address, so whatever argument it made is the one to
re-derive rather than reinvent."* **`poisonDamage` made no argument.** Verified at ritual time:
`poisonDamage` landed **2026-07-14**, `apps/api/src/lobby/match.ts` did not exist until **07-23**, and
`MATCH_RECORD_VERSION` first appeared **07-26** — **twelve days later.** It is a precedent for the
**shape** and silent on the **constant**, and my *"at the same address"* concealed the difference.
🛑 **A builder obeying that sentence hunts an argument that cannot exist — or, worse, infers *"the
sibling didn't bump, so neither should I"* from an absence that means nothing.** D476's hazard
exactly: the citation's content contradicting the sentence citing it. **Date a precedent before
citing it.**

**(3) 🛑 THE OPTIONAL ROAD WAS AVAILABLE AND WAS REFUSED ON MEASURED GROUNDS.** D441's discriminator
answers **YES** (absent would read as the default, and every v29 confusion hit *was* 30), and D434's
*"the rest must be OLD"* is **SATISFIED — only the second time on record.** **What decides it is a
shipped COMPILE-TIME GUARD**: `redact.ts`'s `copyConditions` and `projection.ts`'s `battleStateOf`
each carry a `satisfies SpecialConditions` whose own doc block says it exists so an added engine field
is *a compile error rather than a silent drop* — **and an optional key satisfies both while reaching
neither surface**, silently disarming the two instruments written to catch exactly this. **Both guards
fired on the real edit; that is the evidence, not the argument.**

**(4) 🆕 A FOURTH POSITION IN THE SEQUENCE, AND THE DEGRADATION IS THE SHARPEST YET.** D432 *no rest*,
D434 *rest not old*, D435 *rest old but degradation is NaN*, **D501 *rest old, option available, and
the REST CANNOT WITNESS*** — `rotation: "confused"` is byte-identical at 30 and at 80. Driven over a
reconstructed v29 record with the key genuinely `delete`d: the **EVENT** renders *"hit itself for
undefined"*, while the **BOARD** computes `damage + undefined` → **`NaN`**, `NaN >= hp` is **false**,
and the body **is not Knocked Out and can never be Knocked Out again, on a board that looks entirely
normal**. Neither 80 nor 30.

**(5) 🛑 A LIVE FALSE CLAIM TO PLAYERS, FOUND BY GREPPING EVERY READ SITE BEFORE FIXING ANY** (D412).
`GameHud.tsx` printed *"Confused: attacking flips a coin — tails: 30 damage to itself"* **off
`rotation` alone** — wrong at the exact moment a player decides whether to attack. **Verified at
ritual time: the hard-coded 30 is gone and it now reads the board.** Two further hard-coded *"the 30
self-damage"* prose claims in `events.ts` and `log.ts` were **falsified by this slice and corrected at
the site**.

**(6) THE LATTICE — D489's FULL-WEIGHT SHAPE.** Vector `0/1 · 0/5 · 0/10 · 0/10 · 0/5 · 1/1`: **no
proper subset builds**, so nothing smaller is claimed and there is no superset to compose from. **Six
axes counted from the print, one DEGENERATE** — the count `8`, already claimed by the Poison anchor's
`(\d+)` and driven at 1/2/8/40, so a 2⁶ table would have been this table twice.

**(7) ⚠️ A CHEAPER TAIL-ONLY ANCHOR WAS DRIVEN AND REFUSED** (D485's trap, live). The trailing
splitter **does** compose at this head — measured, not assumed. It is refused because the tail points
**out of its clause twice** (*"on that Pokémon"*, *"for this Special Condition"*) and **492 claimed
corpus sentences end in a period**, including Paralyzed and Burned heads, so a bare-tail arm would
hang a *Confusion* amount off sentences that never mention Confusion.

**(8) NUMBERS.** Residue **83/117 → 82/116**; `BUILT.attack` **1615 → 1616**; the two steps **AGREE at
1 and 1**, verified off the corpus. **Witness load 10 files / 1 row — the worst ratio of the run**,
with eight going red and three trios being byte-identical copies across three files. ⚠️ **The
bare-token census ran FIRST and its output was the DECISION not to use a value-keyed pass**: `117`
matched **186** times and `167` **243** times repo-wide, so every literal was patched **by line
number** (D492). Collected-test count checked: **11,024 → 11,064**, exactly the new suite's count.
**119 files / 935 insertions / 250 deletions** — the largest diff of the run, because a *required*
field ripples through every fixture that builds `SpecialConditions`.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
