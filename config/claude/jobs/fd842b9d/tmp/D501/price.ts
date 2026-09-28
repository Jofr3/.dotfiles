import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const { splitAttackGateClause, splitAttackTrailingClause } = effects as unknown as Record<string, (t: string) => unknown>;

// REGISTRY_ATTACK_SENTENCES: derived from the suite's own REGISTRY_ATTACKS array,
// extracted verbatim (comments stripped) so this probe uses the SAME list the
// canonical predicate does (D430: copy the predicate, do not reconstruct it).
import { REGISTRY_ATTACKS } from "/home/jofre/.claude/jobs/fd842b9d/tmp/D501/regatk.ts";
const REGISTRY_ATTACK_SENTENCES = [...new Set(REGISTRY_ATTACKS.map(([, text]) => text))];
console.log(`REGISTRY_ATTACK_SENTENCES: ${REGISTRY_ATTACK_SENTENCES.length}`);

// THE CANONICAL RESIDUE PREDICATE, copied verbatim from censusAtHead.test.ts.
function residue(extra: ((t: string) => unknown) | null) {
  const claimed = (t: string) => resolvedByAnyReader(t) || (extra !== null && extra(t) !== null);
  const rawUnbuiltSentences = legalAttackCorpus().filter(([, text]) => !claimed(text));
  const residueSentences = rawUnbuiltSentences.filter(([, text]) => {
    if (REGISTRY_ATTACK_SENTENCES.includes(text)) return false;
    const gate = splitAttackGateClause(text) as { body: string } | null;
    if (gate !== null && gate.body !== "" && claimed(gate.body)) return false;
    return splitAttackTrailingClause(text) === null;
  });
  return {
    rawS: rawUnbuiltSentences.length,
    rawP: rawUnbuiltSentences.reduce((a, [n]) => a + n, 0),
    resS: residueSentences.length,
    resP: residueSentences.reduce((a, [n]) => a + n, 0),
  };
}

const BASE = residue(null);
console.log(`BASE residue: raw ${BASE.rawS} sentences / ${BASE.rawP} printings; canonical ${BASE.resS} / ${BASE.resP}`);

// BRANCH B — the whole-sentence anchor. Literal default `3`, captured count.
const DEFENDER_CONFUSION_N =
  /^Your opponent['’]s Active Pokémon is now Confused\. Put (\d+) damage counters instead of 3 on that Pokémon for this Special Condition\.$/;
const readerB = (t: string) => (DEFENDER_CONFUSION_N.test(t) ? [{ op: "applyStatus" }] : null);
const B = residue(readerB);
console.log(`\nBRANCH B (whole-sentence anchor) ALONE: raw ${B.rawS}/${B.rawP}  canonical ${B.resS}/${B.resP}`);
console.log(`  delta vs base: raw ${B.rawS - BASE.rawS} sentences / ${B.rawP - BASE.rawP} printings; canonical ${B.resS - BASE.resS} / ${B.resP - BASE.resP}`);
console.log(`  rows the anchor claims over all 640: ${legalAttackCorpus().filter(([, t]) => DEFENDER_CONFUSION_N.test(t)).map(([n, t]) => `${n}p :: ${t}`).join(" | ")}`);

// The WIDER form: capture the printed default too.
const WIDE = /^Your opponent['’]s Active Pokémon is now Confused\. Put (\d+) damage counters instead of (\d+) on that Pokémon for this Special Condition\.$/;
console.log(`  WIDER (default captured) claims: ${legalAttackCorpus().filter(([, t]) => WIDE.test(t)).length} sentence(s) — same rows? ${legalAttackCorpus().filter(([, t]) => WIDE.test(t)).length === legalAttackCorpus().filter(([, t]) => DEFENDER_CONFUSION_N.test(t)).length}`);

// BRANCH A — the state channel ALONE (no reader change). Residue is byte-identical.
console.log(`\nBRANCH A (SpecialConditions.confusionDamage + attack.ts read) ALONE: 0 sentences / 0 printings — no reader moves, so the residue is byte-identical to BASE by construction.`);

// BRANCH B2 — a BARE TAIL anchor reached through splitAttackTrailingClause.
const TAIL = "Put 8 damage counters instead of 3 on that Pokémon for this Special Condition.";
const HEAD = "Your opponent's Active Pokémon is now Confused.";
console.log(`\nBRANCH B2 (bare tail + trailing splitter):`);
console.log(`  splitAttackTrailingClause(PRINT) today = ${JSON.stringify(splitAttackTrailingClause(`${HEAD} ${TAIL}`))}`);
// Does the splitter compose AT THIS HEAD when the tail IS claimed? Drive it with a tail deriveAttackEffect already takes.
for (const t of ["Draw a card.", "During your opponent's next turn, that Pokémon can't retreat."]) {
  console.log(`  compose probe  "${HEAD} ${t}"  →  ${JSON.stringify(splitAttackTrailingClause(`${HEAD} ${t}`))}`);
}
console.log(`  tail printed STANDALONE in the corpus? ${legalAttackCorpus().some(([, t]) => t === TAIL)}`);
