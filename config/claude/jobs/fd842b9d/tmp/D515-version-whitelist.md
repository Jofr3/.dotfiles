# D515 VERSION SWEEP 0.401.0 → 0.402.0 — THE WHITELIST, WRITTEN BEFORE THE SWEEP (D507)

## SWEEP ONLY THESE CLASSES (never a value-keyed grep — that is what ate D500's heading)
1. `expect(engineVersion).toBe("0.401.0")`            — 74 occurrences
2. `expect(manifest.version).toBe("0.401.0")`         —  5
3. an `it(…)` TITLE that spells the version           — 24
4. `export const engineVersion = "0.401.0";`          —  1  (packages/engine/src/index.ts)
5. `"version": "0.401.0"` in packages/engine/package.json — 1
6. `mutants.ts` rows whose `find` quotes one of those — 1 (mutants.ts:5801, the declaration)
   TOTAL TO MOVE: 106

## EXCEPTION LIST — 8 occurrences that MUST STAND STILL, named before the sweep (D506 rule (b))
a. packages/engine/src/index.ts:19987 — D514's heading TARGET `engineVersion 0.400.0 → **0.401.0**`
b. packages/engine/src/index.ts:20060 — D514's prose about its own relabel (`0.400.0 → 0.401.0`)
c. packages/engine/src/index.ts:20067 — D514's prose naming namedDeckSearch's header arrow
d. packages/engine/src/namedDeckSearch.test.ts:39 — D514's header arrow `0.400.0 → 0.401.0`
e. scripts/mutation/mutants.ts:5254 — the D275 re-point LEDGER comment
f/g. scripts/mutation/mutants.ts:29068/29069 — `D506-changelog-head-unnamed`'s find/replace.
     ⚠️ NOT SWEPT — RE-POINTED onto THIS slice's heading, in the same edit as the heading and the
     constant, keeping D508's TRIMMED form that stops before the `(`.
h. packages/engine/src/handCostOpponentDiscard.test.ts:34 — THIS slice's own header arrow SOURCE
   (`0.401.0 → 0.402.0`), which is a 0.401.0 occurrence by construction.
+ THIS slice's new heading SOURCE in index.ts (`engineVersion 0.401.0 → **0.402.0**`), written by
  this slice, is a ninth once it exists.
+ docs/ history: 7 occurrences, out of scope.

## AFTER THE SWEEP
Re-grep `0.401.0` outside docs/ and check that what remains is EXACTLY this list.
Then run `bun scripts/mutation/precheck.ts` (NOT part of `check`) — index.ts was edited.
