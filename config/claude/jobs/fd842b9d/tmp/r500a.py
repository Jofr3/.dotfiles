import io
p='docs/progress.md'
lines=io.open(p,encoding='utf-8').read().split('\n')
old6=lines[5]
assert old6.startswith('**Last updated:** 2026-09-11 — build session #439')
new6=('**Last updated:** 2026-09-11 — build session #440 (**P3-M5 — D500, *the Basic Energy attached '
 'count — a FOURTH lattice shape, and THE BUILDER DIED BEFORE REPORTING YET THE SLICE WAS FULLY '
 'RECOVERABLE.*** Built corpus row *"This attack does 40 damage for each Basic Energy attached to '
 'this Pokémon."* — **1 sentence / 1 legal printing**. 🛑 **THE AGENT TERMINATED ON A SERVER-SIDE 500 '
 'MID-SLICE AND WROTE NO REPORT.** Its last words were that a surviving row was **inert on the board '
 'it had chosen** — not a killer-set problem — and that it was fixing the suite (D496/D499). '
 '**Everything below was verified and derived by the caller from the tree itself**, not from a '
 'report: `bun run check` GREEN **483 files / 11,024 tests**, `precheck` clean at **2,446**, '
 '`residue-census-gate` **OK §A 109 / 83 / 117**, `partition-gate` OK, and the probe **7 killed · 0 '
 'known survivors · 0 GAP · 0 error** — **so the repair had landed before the failure.** ✅ **AND THE '
 'REASONING WAS RECOVERABLE BECAUSE IT IS PINNED IN THE SUITE RATHER THAN NARRATED IN PROSE**, which '
 'is what this loop\'s own discipline is for: the lattice vector, the degeneracy argument and the '
 'separating board are all readable out of `basicEnergyScaling.test.ts` and the doc blocks. '
 '🛑 **A FOURTH LATTICE SHAPE, READ OUT OF THE SUITE: `0/1 · 1/1`, a 2¹ TABLE**, because **three of '
 'four candidate axes are DEGENERATE** by D491/D494\'s test — each one\'s printed value already '
 'builds on an otherwise-built sentence, so substituting it changes nothing. That stands beside '
 'D489/D490/D494\'s *one built point at FULL weight*, D495\'s `0/1 · 2/2 · 0/1` *every segment '
 'builds*, and D499\'s `0/1 · 1/3 · 0/1` *prereq half*. **A single-axis sentence: the NOUN is the '
 'whole blocker.** 🛑 **AND THE CARDS-VERSUS-PROVISIONS QUESTION — the one I predicted would be the '
 'content — WAS DRIVEN, NOT ASSERTED.** A Special Energy may **PROVIDE** a basic type, so *"each '
 'Basic Energy attached"* must count **CARDS**, not provisions. The suite fields **`fix-blend`, a '
 'SPECIAL Energy whose registry `EnergyProgram` provides a basic type**, plus a control of the same '
 'card class with no basic provision — **so the two readings are separated by a real board and not '
 'by argument.** **SHIPPED**: one new value `"basic"` on the shipped energy-category axis '
 '(`BasicEnergyType | "special" | "basic" | null`) and one `basicEnergyUids` helper in '
 '`continuous.ts` that asks **`card.energyType === "Normal"` through `matchesFilter`\'s ALREADY-'
 'SHIPPED `basicEnergy` arm** — **one noun, one answer** (D159), rather than a second reader of the '
 'same word. Engine **0.391.0 → 0.392.0**. Corpus **2,439 → 2,446**, declared survivors **48 '
 'UNCHANGED**, archive ratchet **170**. `it(` delta **+22 EXACT**, all in the new suite. Residue '
 '**84/118 → 83/117**, `BUILT.attack` **1614 → 1615**; the two steps **AGREE at 1 and 1**. ⚠️ **WHAT '
 'IS NOT RECOVERABLE AND IS NOT INVENTED HERE**: the builder\'s branch pricing, its tripwire audit, '
 'its witness-load count and its `MATCH_RECORD_VERSION` argument were never written down. **The '
 'version is UNCHANGED at 29 and the gates agree, but no argument for it is on record** — a '
 'successor touching this row should re-derive it rather than assume one was made.)')
lines[5]=new6
lines.insert(7,'**Last updated (was):** '+old6.split('**Last updated:** ',1)[1])
lines.insert(8,'')
io.open(p,'w',encoding='utf-8').write('\n'.join(lines))
print('ok')
