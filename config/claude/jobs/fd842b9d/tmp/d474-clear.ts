import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const survivors = MUTANTS.filter((m) => m.survives !== undefined);
console.log("declared survivors:", survivors.length);
const byFile = new Map<string, typeof survivors>();
for (const s of survivors) {
  const list = byFile.get(s.file) ?? [];
  list.push(s);
  byFile.set(s.file, list);
}
for (const [f, list] of [...byFile].sort()) console.log(`  ${list.length}  ${f}`);

const TOUCHED = new Set(["packages/engine/src/effects.ts", "packages/engine/src/attack.ts"]);
const DELETED = [
  "    (D128). Three members, because the pool prints the count three ways and only",
  "    one of them is a number the deriver can read:",
  "  const flips =",
  '    count.kind === "printed"',
  "      ? count.count",
  "      : countAttachedEnergy(state, state.players[attackerSeat].active ?? attacker, count.energy);",
];
console.log("\n── survivors in a TOUCHED file (step three) ──");
for (const s of survivors) {
  if (!TOUCHED.has(s.file)) continue;
  const quotesDeleted = DELETED.some((d) => s.find.includes(d.trim()) || s.replace.includes(d.trim()));
  const reasonNames = /takeFlips|AttackFlipCount|flip|coin|attachedEnergy|pokemonInPlay/i.test(
    (s.survives?.reason ?? "") + s.what,
  );
  console.log(`  ${s.id}\n     file=${s.file}  quotesDeletedLine=${quotesDeleted}  reasonMentionsFlipMachinery=${reasonNames}`);
}
