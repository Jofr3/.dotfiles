import io, json

GATE = "scripts/mutation/partition-gate.ts"
PRE = "scripts/mutation/precheck.ts"
CMD = '["bun", "scripts/mutation/partition-gate.ts"]'

rows = [
    # id, what, file, find, replace
    ("D484-key-drops-the-target-file",
     "⚠️ **THE EXPERIMENT KEY STOPS READING `file`**, so two rows patching the SAME TEXT in DIFFERENT files read as one experiment and the gate reddens on a corpus that is correct. This is the false-positive direction and it is the one that gets a guard deleted rather than fixed: a corpus author handed a red naming two rows that are visibly in two files will conclude the check is wrong. 🛑 **Only the SELF-CHECK can catch it** — the live corpus has no such pair today, so a run against `MUTANTS` alone would stay green and the rung would be a decoration.",
     GATE, "    m.file,\n    m.find,", "    m.find,"),

    ("D484-key-drops-the-find",
     "🛑 **THE EXPERIMENT KEY STOPS READING `find` — THE FIELD D483's DEFECT WAS IN.** Every row that patches one file with one replacement then reads as the same experiment regardless of WHICH TEXT it patches, which is the gate agreeing that the corpus is duplicated everywhere. ⚠️ It is the mirror of the defect: the guard built to notice two rows sharing a `find` stops being able to tell two `find`s apart.",
     GATE, "    m.find,\n    m.replace,", "    m.replace,"),

    ("D484-key-drops-the-replace",
     "🛑 **THE EXPERIMENT KEY STOPS READING `replace`, WHICH DELETES THE CORPUS'S CENTRAL IDIOM.** One anchor line with N different corruptions of it is how this corpus is written — D484 measured 292 `(file, find)` groups over 724 rows — so a key blind to `replace` calls every one of them a duplicate. ⚠️ **The gate would go red on 292 groups and every one would be a lie**, which is worse than silence: a guard that is red on a correct repo is not a guard either (D481).",
     GATE, "    m.replace,\n    m.nameFilter ?? null,", "    m.nameFilter ?? null,"),

    ("D484-key-drops-the-name-filter",
     "⚠️ **THE EXPERIMENT KEY STOPS READING `nameFilter`**, so two rows applying one patch and narrowing to DIFFERENT `vitest -t` names read as one experiment. They are not: the runner passes that string through, so the two rows run different rungs against the same mutant, which is exactly the shared-arm split the corpus already uses across suites. A false positive on a legitimate pair, and the only board that shows it is the synthetic one.",
     GATE, "    m.nameFilter ?? null,\n    [...m.expectKilledBy].sort(),", "    [...m.expectKilledBy].sort(),"),

    ("D484-key-drops-the-suite-killers",
     "🛑 **THE EXPERIMENT KEY STOPS READING `expectKilledBy`, WHICH IS THE ONE FIELD THAT MAKES THE FOUR LEGITIMATE SHARED-PATCH PAIRS LEGITIMATE.** `D316-yes-arm-loses-the-bonus` and its D317 twin are byte-identical patches owed a kill from each of two sentences — the point rather than a duplicate, as that row's own `what` says. Drop the killers and the gate reddens on all four, and the obvious repair is the wrong one: deleting a row that is carrying a real proof. ⚠️ **This is the row that would have produced an EXEMPTION LIST**, and an exemption list is where a corpus guard goes to die.",
     GATE, "    [...m.expectKilledBy].sort(),\n    m.killedByCommand ?? null,", "    m.killedByCommand ?? null,"),

    ("D484-suite-killers-become-order-sensitive",
     "⚠️ **THE KILLER LIST STOPS BEING A SET.** `expectKilledBy` is a positional filter the runner hands to `vitest`, and naming the same two suites in the other order runs the same suites — so two rows that differ only in that order ARE one experiment, and this mutation lets the pair through. 🛑 **It is the SILENT direction**: the gate stays green, the corpus keeps a duplicate, and the only thing that ever moves is a `what` field nobody re-reads. A hole an author falls into by typing a list twice.",
     GATE, "[...m.expectKilledBy].sort(),", "[...m.expectKilledBy],"),

    ("D484-key-drops-the-command-killer",
     "⚠️ **THE EXPERIMENT KEY STOPS READING `killedByCommand`**, so two guard rows that apply one patch and are answered by DIFFERENT SCRIPTS read as one experiment. This repo has five script-killed guard families (`lint-coverage`, `recovery-gate`, `residue-census-gate`, `opaque-anatomy-gate`, `typecheck-coverage`), and one patch owing a kill from two of them is the same shape as the shared-arm pairs on the suite side. A false positive, invisible in today's corpus, and therefore visible only on a constructed board.",
     GATE, "    m.killedByCommand ?? null,\n    m.survives ?? null,", "    m.survives ?? null,"),

    ("D484-key-drops-the-survival-reason",
     "⚠️ **THE EXPERIMENT KEY STOPS READING `survives`**, so a DECLARED SURVIVOR and a row expected to be KILLED collapse into one experiment when they patch the same text. Those two rows have opposite verdicts: the runner reports `STALE-SURVIVOR` and fails the whole run if the declared one dies. 🛑 **They are the most different two rows this corpus can hold**, and this key would call them identical.",
     GATE, "    m.survives ?? null,\n  ]);", "  ]);"),

    ("D484-group-threshold-admits-a-pair",
     "🛑 **THE GATE STOPS SEEING A PAIR AND ONLY REPORTS TRIPLES** — `group.length > 1` becomes `> 2`. **D483's defect was a PAIR**, and so is every duplicate this corpus has ever held, so the gate goes green on the exact input it was built for and stays green forever. ⚠️ This is D481's `=== 0` → `<= 1` widening at a different arithmetic: **the failure mode of a coverage guard is going vacuous, and a vacuous guard PASSES**, which this corpus treats as informative.",
     GATE, "  return [...byKey.values()].filter((group) => group.length > 1);", "  return [...byKey.values()].filter((group) => group.length > 2);"),

    ("D484-verdict-is-hardcoded-clean",
     "🛑 **THE VERDICT IS BLANKED: `isPartitioned` RETURNS `true` WITHOUT LOOKING.** The whole gate becomes a print statement — `precheck` reports the green summary line, the sweep reports nothing, and a mutation against any of the rows above SURVIVES and is believed. **This is the one mutation whose whole point is that the guard cannot notice it from the repo**, because the repo is currently clean and a blanked predicate and a correct one give the same answer on it. It dies on the SELF-CHECK's twins alone.",
     GATE, "  return indistinguishableGroups(rows).length === 0;", "  return true;"),

    ("D484-near-miss-population-collapses-to-nothing",
     "⚠️ **THE REPORTED SHARED-PATCH POPULATION GOES SILENTLY TO ZERO** — keyed on `id`, which is unique by construction, so the count printed on the GREEN path becomes a permanent 0. Nothing asserts that number, which is exactly why it needs a rung: `splice-gate`'s rule is that a guard whose subject can drift to zero without saying so is one refactor away from vacuous, and `patches LITERALLY (21 rows)` is tracked as a hazard for that reason. **A population that reads 0 forever is indistinguishable from a corpus that stopped using the shared-arm idiom.**",
     GATE, "    const key = JSON.stringify([m.file, m.find, m.replace]);", "    const key = m.id;"),

    ("D484-near-miss-population-counts-the-whole-file",
     "⚠️ **THE SHARED-PATCH POPULATION WIDENS TO THE FILE** and reports every row in `effects.ts` as sharing a patch with every other — the same number's other failure direction. A green-path figure that reads 1,500 is as uninformative as one that reads 0, and worse: it looks like a finding. 🛑 **Both directions need their own rung**, because a count that is only checked for being non-zero can be defeated by making it enormous.",
     GATE, "    const key = JSON.stringify([m.file, m.find, m.replace]);", "    const key = m.file;"),

    ("D484-precheck-stops-calling-the-gate",
     "🛑 **THE WIRING IS CUT: `precheck.ts` STUBS THE GATE INSTEAD OF CALLING IT.** `bun run check` is green with a broken corpus by design, so `precheck` is the only command that precedes every sweep — a gate it does not call runs when someone runs it by hand, which is never. ⚠️ **This is D212's gap, and it is why the rung exists**: `lint-coverage.ts` is a perfect check that can still be switched off by deleting eight words from `package.json` with nothing going red, and **a guard removed from the command is indistinguishable from a guard that passes**.",
     PRE, "const partition = partitionReport();", "const partition = { ok: true, lines: [\"stubbed\"], sharedPatchRows: 0 };"),
]

block = []
block.append("""  // ── D484 · the partition gate ──────────────────────────────────────────────
  // ⚠️ The killer is a SCRIPT, not a suite — D212's `killedByCommand` precedent:
  //    `scripts/**` is outside vitest's globs, so a guard over the harness names its
  //    own command. `bun scripts/mutation/partition-gate.ts` exits non-zero for every
  //    row below.
  //
  // 🛑 **TEN OF THE THIRTEEN DIE ON THE SELF-CHECK RATHER THAN ON THE CORPUS, AND
  //    THAT IS THE DESIGN.** The corpus is CLEAN at HEAD — D484 measured zero
  //    indistinguishable groups over 2,267 rows — so a mutation that only WIDENS the
  //    predicate leaves a green corpus green and would report SURVIVED. The synthetic
  //    pairs in `selfCheck()` are the board those mutations die on, and without them
  //    this whole family would be unkillable-as-written (D479): the guard's one real
  //    failure mode is going vacuous, and **the danger of a vacuous guard is not that
  //    it fails, it is that it PASSES**.
  //
  // ⚠️ **A ROW WAS CONSIDERED AND REFUSED HERE**: *"the self-check is deleted"*. It is
  //    UNKILLABLE BY CONSTRUCTION — removing the self-check makes the gate report OK on
  //    this repo, so the mutant survives, and a survivor is a verdict this corpus
  //    treats as a fact about the code. A rung that cannot fire is not a weaker guard;
  //    it is not a guard (D481).""")

for rid, what, f, find, repl in rows:
    block.append("  {")
    block.append('    id: %s,' % json.dumps(rid))
    block.append('    decision: "D484",')
    block.append('    what: %s,' % json.dumps(what, ensure_ascii=False))
    block.append('    file: %s,' % json.dumps(f))
    block.append('    find: %s,' % json.dumps(find))
    block.append('    replace: %s,' % json.dumps(repl))
    block.append('    expectKilledBy: [],')
    block.append('    killedByCommand: %s,' % CMD)
    block.append("  },")

text = "\n".join(block) + "\n"

p = "scripts/mutation/mutants.ts"
s = io.open(p, encoding="utf8").read()
assert s.endswith("];\n"), repr(s[-10:])
s = s[: -len("];\n")] + text + "];\n"
io.open(p, "w", encoding="utf8").write(s)
print("appended", len(rows), "rows")
