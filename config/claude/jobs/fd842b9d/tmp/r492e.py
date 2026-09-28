import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### A bare `toBe(N)` replacement is a line-targeted edit wearing a global one's clothes (D492)

D435's *grep the assertion, not the string* is necessary and **not sufficient**. `toBe(24)` **is**
the assertion spelling, and a repo-wide replacement of it hit **7 sites in 6 files** where exactly
one was the census figure.

🛑 **Worse, the obvious repair is NOT AN INVERSE.** Replacing the new value back also rewrites every
site that legitimately held the new value all along — D492 broke **9 pre-existing assertions** that
way, in one command, while undoing an over-patch of 7.

⚠️ **And the suite was GREEN through the over-patch**, because the other assertions in those files
still passed. No test could have caught it; it was found only by reading `git diff -U0`.

**Two rules.**

1. **For a literal under ~4 digits, patch BY LINE NUMBER** — derive the target lines from
   `git diff -U0`, or from the runner's `file:line`. A value-keyed pass is only safe for a figure
   large enough to be unique, and one `grep -c` tells you which case you have before you write
   anything.
2. **A revert is a diff-driven edit too.** Undo the **lines** the diff shows you changed, never the
   **value** you changed them to.

**Verify the repair by paired analysis, not by a green suite**: count each changed literal on both
sides of the diff and confirm every value nets out to the intended step. D492's repair was confirmed
by `toBe(24)` net −1 against `toBe(28)` net +1 — exactly one site, the intended one.

### An instrument's classification is an answer to the question the instrument asks (D492)

`residue-census.ts` classifies a residue row by **cutting** a segment and re-reading the remainder.
That answers *"does the remainder build?"* It **cannot** answer *"does the remainder compose?"* — and
those come apart.

D492's two rows were filed `COMPOUND-tail` on the strength of a `CUT 🛑 does NOT build:` line, and a
work order quoted that line as proof the head was the only blocker. Measured in the other direction,
the **tail was a blocker too**: the head under D482's *parenthetical* builds, while the same head
under a W/R **suppression sentence** does not, because `splitAttackTrailingClause` requires the tail
to be a `deriveAttackEffect` clause and a suppression is a damage reader's (D466).

🛑 **Never quote a classifier's label as a blocker count.** Run the substitution in **both**
directions — vary the segment you kept as well as the one you cut — before pricing anything.

### When two readings collide, find the ONE BYTE that splits them (D492)

The instinct on a collision board is to reach for a bigger board. Often the tie breaks on a single
property instead, and finding it is cheaper and makes a sharper rung.

*"Does 60 damage **TO** each of your opponent's Pokémon ex"* and *"…**FOR** each…"* are identical —
`[60, 0]` — on an Active `ex` with no Weakness and no benched `ex`. **A Weakness ×2 on that same
one-body board splits them 60 against 120.** No extra bodies required.

**Enumerate the readings first, then look for the smallest perturbation that separates the most of
them.** D492 enumerated ten and found one board separating six numerically plus a seventh **by
shape** (the wrong reading *parks* rather than answering a number) — a distinction worth reaching for,
since a parked program and a wrong number fail differently.

### A gate population that moves must be VERIFIED, not accepted (D492, applying D491)

D491 recorded that `spliceReport`'s population moves when a row **breaks**, not only when one is
written. D492 moved it 21 → 22 in the other direction — and the check is the same either way:
**re-derive the population independently** rather than accepting the builder's account of it.

The precise criterion is a `String.replace` special in the row's `replace` — `$$`, `$&`, `` $` ``,
`$'`, `$n`, `$<name>` — **not a bare `$`**, which over-counts by an order of magnitude (212 rows
against the true 22). Re-derived that way, exactly one D492 row qualified, so the move was an
authored dependency.

⚠️ **The builder's report named the wrong row for it.** The conclusion was right and the citation was
not, which is the same name-without-checking failure that has recurred across this run — and it is
why the population is re-derived at ritual time rather than read.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
