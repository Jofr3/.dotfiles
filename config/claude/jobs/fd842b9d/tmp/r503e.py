import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### Run the lattice over the RESIDUE PREDICATE, not over the readers alone (D503)

D503 ran both and they disagreed about the slice:

| lattice | vector | what it says |
|---|---|---|
| the 13 readers only | `0/1 · 0/3 · 0/3 · 0/1` | D502's empty shape — *"the seam has no path"* |
| **readers + splitters** | `0/1 · 0/3 · 1/3 · 1/1` | *"the seam HAS a path, and one reader's refusal is the only guard"* |

**Opposite conclusions from one sentence, and only the second is actionable** — it is what exposed a
composition road that was completely unguarded.

⚠️ **Every lattice this run has reported was readers-only**, so the six recorded shapes may each be
missing a splitter dimension. **Re-run one whenever the answer would change what you build.**

### "The order is unobservable on today's column" can be CIRCULAR (D503)

`attack.ts` carries an honest placement comment: *"no printing carries both … so the order is
unobservable on today's column."* The column **does** print the pairing — D503's row is the only one,
measured — and the order is unobservable **only because that sentence is unbuilt, and it is unbuilt
because of the order.**

🛑 **When a placement comment cites the pool as its warrant, check whether the pool's silence is
caused by the thing being excused.** The comment is not wrong; its warrant is self-sealing, and a
successor reading it as evidence will conclude the question is settled when it is merely closed.

⚠️ **Related**: the same file's invariant *"one `preDamage` and one `program` can never both be
non-null"* is **true in its literal form and false in its stated reason** — *"the readers are
whole-sentence anchored and disjoint by construction"* was already falsified by three sentences /
five printings built deliberately. **A true conclusion can sit on a rotted premise, and the premise
is what a successor reuses.**

### A reason can be TRUE UNDER A NARROWER READING THAN ITS WORDS CARRY (D503, a fourth mode)

D479 named three ways a recorded reason fails: **false when written**, **rotted since**, and
**reason-only** (the verdict holds, the stated cause does not). D503 found a fourth.

*"An unbounded count"* reads as a missing capability, and the capability has shipped since D247. The
verdict was still correct — the real blocker is a **pincer**, where one op has the unbounded count
but no destination narrowing and the other has the narrowing but a numeric count, so **neither op has
both halves**. The words were true of one op and false of the engine.

**Re-derive a reason at the precision a builder would act on**, not at the precision that makes it
sound right. A reason that is true-but-imprecise sends a successor to widen the wrong op.

### Count refusal witnesses by which BUILD ROAD each can see (D503)

Two witness files named D503's sentence, and they are **complementary, not redundant**: one asserts
the effect reader is null and catches the composition road only; the other asserts the two damage
readers are null and catches the vocabulary road only. **Neither covers both.**

**When re-pointing or pruning refusal witnesses, map them against the roads a build could take.** Two
witnesses that look like duplicates may be a partition, and deleting either opens a road silently.

### Re-derive a census literal from the module, never from a convention (D503)

`D495-census-built-attack-not-stepped` quotes the current `BUILT.attack` literal in its `find`, so it
**rots on every census step**. D502 recorded that row's literal in a convention entry as `1616`; it
was **1617** at the time of writing and the entry was stale on arrival.

🛑 **A convention that quotes a moving number is a convention that will be wrong.** Name the row and
the mechanism — *"it quotes the current `BUILT.attack` literal"* — and let the reader derive the
value. D503 corrected D502's entry in place.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
