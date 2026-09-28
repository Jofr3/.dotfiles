import io
p='docs/progress.md'
s=io.open(p,encoding='utf-8').read()
old_row='| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D499,'
i=s.index(old_row); j=s.index('\n',i)
new_row=('| simulator | P3 | 🚧 **M1–M3 + M4 done; M5 in progress** (latest: **P3-M5 — D500, *the Basic '
 'Energy attached count — and the builder died mid-slice without reporting*: a FOURTH lattice shape '
 '(`0/1 · 1/1`, a 2¹ table, three of four axes degenerate), the cards-versus-provisions question '
 'driven with a Special Energy that provides a basic type, and one new value reusing the shipped '
 '`basicEnergy` arm. The agent terminated on a server-side 500 — the caller verified the whole state '
 'from the tree and found the repair had landed, and the REASONING was recoverable because it is '
 'pinned in the suite rather than narrated. 1 sentence / 1 printing**; engine 0.392.0, corpus 2,446, '
 'check GREEN 483/11,024) |')
s=s[:i]+new_row+s[j:]
log_anchor='### 2026-09-11 — build session #439 (P3-M5 — D499)'
assert s.count(log_anchor)==1
ENTRY = r'''### 2026-09-11 — build session #440 (P3-M5 — D500)

**THE BASIC ENERGY ATTACHED COUNT — A FOURTH LATTICE SHAPE, AND THE BUILDER DIED BEFORE REPORTING YET
THE SLICE WAS FULLY RECOVERABLE.** Engine **0.391.0 → 0.392.0**, **`MATCH_RECORD_VERSION` 29**,
corpus **2,439 → 2,446**, declared survivors **48 UNCHANGED**, archive ratchet **169 → 170**,
`bun run check` GREEN at **483 files / 11,024 tests**.

**(0) 🛑 THE AGENT TERMINATED ON A SERVER-SIDE 500 MID-SLICE AND WROTE NO REPORT.** Its last words
were that a surviving row was **inert on the board it had chosen** — not a killer-set problem — and
that it was fixing the suite (D496/D499's pattern). **Everything recorded here was verified and
derived by the caller from the tree**, not from a report: `check` GREEN **483 / 11,024**, `precheck`
clean at **2,446**, `residue-census-gate` **OK §A 109 / 83 / 117**, `partition-gate` OK, probe
**7 killed · 0 known survivors · 0 GAP · 0 error**, **no journal on disk, no harness running**,
`docs/` untouched, `progressLog.test.ts` byte-unchanged. **So the repair had landed before the
failure, and the tree was COMPLETE rather than partial.**

**(1) ✅ AND THE REASONING WAS RECOVERABLE, BECAUSE IT IS PINNED IN THE SUITE RATHER THAN NARRATED.**
The lattice vector, the degeneracy argument and the separating board all read out of
`basicEnergyScaling.test.ts` and the doc blocks. **That is this loop's own discipline — assertions
as the record, prose as the commentary — paying for itself under a failure mode it was not designed
for.**

**(2) 🆕 A FOURTH LATTICE SHAPE: `0/1 · 1/1`, A 2¹ TABLE.** **Three of four candidate axes are
DEGENERATE** by D491/D494's test — each one's printed value already builds on an otherwise-built
sentence, so substituting it changes nothing. That stands beside D489/D490/D494's *one built point at
FULL weight*, D495's `0/1 · 2/2 · 0/1` *every segment builds*, and D499's `0/1 · 1/3 · 0/1`
*prerequisite half*. **This is the SINGLE-AXIS sentence: the NOUN is the whole blocker**, and the
honest table is smaller than the axis list suggests.

**(3) 🛑 THE CARDS-VERSUS-PROVISIONS QUESTION WAS DRIVEN, NOT ASSERTED.** A Special Energy may
**PROVIDE** a basic type, so *"each Basic Energy attached"* must count **CARDS**, not provisions —
and the shipped attached-counter counts provisions. The suite fields **`fix-blend`, a SPECIAL Energy
whose registry `EnergyProgram` provides a basic type**, plus **a control of the same card class with
no basic provision**, so the two readings are separated by a real board rather than by argument.

**(4) WHAT SHIPPED.** One new value **`"basic"`** on the shipped energy-category axis
(`BasicEnergyType | "special" | "basic" | null`) and one `basicEnergyUids` helper in `continuous.ts`
that asks **`card.energyType === "Normal"` through `matchesFilter`'s ALREADY-SHIPPED `basicEnergy`
arm** — **one noun, one answer** (D159), rather than a second reader of the same printed word. The
doc block records the asymmetry that makes this safe: the other category value has a hazard `"basic"`
does not.

**(5) ⚠️ WHAT IS NOT RECOVERABLE, AND IS NOT INVENTED HERE.** The builder's **branch pricing**, its
**tripwire audit**, its **witness-load count** and its **`MATCH_RECORD_VERSION` argument** were never
written down. **The version is unchanged at 29 and every gate agrees, but NO ARGUMENT FOR IT IS ON
RECORD.** 🛑 **A successor touching this row must re-derive it rather than assume one was made.**
This is D410's situation — *finished by hand after the agent died, and the debt named rather than
implied* — and the debt is named.

**(6) NUMBERS.** Residue **84/118 → 83/117**; `BUILT.attack` **1614 → 1615**; **the two steps AGREE
at 1 and 1**. `it(` **+22 EXACT**, all in the new suite, no other suite moving, verified per file.
Version tax **101 occurrences / 70 files**. Probe **7 killed · 0 survivors**, `patches LITERALLY`
**22**.

'''
s=s.replace(log_anchor,ENTRY+log_anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
