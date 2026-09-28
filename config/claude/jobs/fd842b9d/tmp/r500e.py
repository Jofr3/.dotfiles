import io
p='docs/conventions.md'
s=io.open(p,encoding='utf-8').read()
anchor='## Git / commits'
NEW = r'''### An agent can die mid-slice and leave a COMPLETE, green tree — verify before assuming it is partial (D500, applying D410)

D500's builder terminated on a server-side 500 and wrote no report. Its last words were that it was
mid-repair, which reads like a half-finished slice. **It was not**: `bun run check` was green at
483 files / 11,024 tests, `precheck` was clean, every gate passed, and the decision probe returned
7 killed / 0 survivors / 0 GAP.

🛑 **Verify the state before deciding what it is.** The full check is cheap and it is six things:
`bun run check`, `precheck`, every gate, the decision probe, `tmp/mutation-journal.json`, and `ps`
for a live harness. Any one of them alone can mislead.

✅ **And the reasoning was recoverable, because this loop pins it in the SUITE rather than narrating
it.** The lattice vector, the degeneracy argument and the separating board were all readable out of
the new test file and the doc blocks. **That is the assertions-as-the-record discipline paying for
itself under a failure mode it was not designed for** — and it is the strongest argument for writing
a measurement into a rung rather than into a report.

⚠️ **Name what the lost report cannot tell you, rather than implying it was said.** D500's branch
pricing, tripwire audit, witness load and `MATCH_RECORD_VERSION` argument were never written down.
The version is unchanged and the gates agree, but **no argument for it is on record**, and the
decision row says so. A successor must re-derive it. **A gap in the record is a finding; a gap
papered over is a lie with a date on it.**

### A fourth lattice shape: the SINGLE-AXIS sentence (D500)

Four shapes are now on record, and the vector is what distinguishes them:

| shape | vector | what it says |
|---|---|---|
| D489 / D490 / D494 | one built point at **full** weight | no proper subset builds |
| D495 | `0/1 · 2/2 · 0/1` | **every segment** builds; only the combination has no reader |
| D499 | `0/1 · 1/3 · 0/1` | a **prerequisite half**; the blocker is the JOIN |
| **D500** | **`0/1 · 1/1`** | **one axis carries the whole blocker** |

D500's candidate axis list had four entries and **three were degenerate** — each one's printed value
already builds on an otherwise-built sentence, so substituting it changes nothing.

🛑 **The honest table was 2¹, and saying so is the finding.** A 2⁴ table would have been the same
table reported eight times, which is D491's degeneracy rule arriving at the table's *size* rather
than at a single axis.

### When a printed noun names a CARD CLASS, count CARDS and not what they PROVIDE (D500)

*"For each Basic Energy attached"* is not *"for each basic-type Energy provided"*. **A Special Energy
card can provide a basic type**, so the two readings diverge on a real board — and the shipped
attached-counter counted provisions.

**The separating board needs a card of the other class that provides the type in question**, plus a
control of the same class that does not. D500 fields both, so the reading is pinned by a board rather
than by an argument.

⚠️ **And reuse the shipped arm for the noun** (D159: one noun, one answer). D500's new category value
asks `matchesFilter`'s existing `basicEnergy` arm rather than writing a second reader of the same
printed word — which is what keeps the two surfaces from drifting apart later.

### A first-probe survivor has THREE diagnoses, not two (D500, extending D455/D499)

D455 gave *narrow killer set*; D499 gave *real suite gap*, discriminated with `--only … --full`.
D500 adds the third: **the row is INERT ON THE BOARD THE SUITE FIELDS** — the mutation is observable
in principle, but nothing in the fixture pool can reach it.

The remedy differs from both: not a wider killer set, and not a new rung on the same board, but **a
fixture that can express the difference**. D500's needed a wildcard provider.

🛑 **Distinguish the three before acting.** Widening a killer set for an inert row hides the fixture
gap; adding a fixture for a genuinely narrow killer set is wasted work.

'''
s=s.replace(anchor,NEW+anchor,1)
io.open(p,'w',encoding='utf-8').write(s)
print('ok')
