import { readFileSync } from "node:fs";
const ROOT = "/home/jofre/projects/luminous_ui";
const { MUTANTS } = await import(`${ROOT}/scripts/mutation/mutants.ts`);
const REGIONS: Record<string, [number, number, string][]> = {
  "packages/engine/src/attack.ts": [
    [836, 905, "AttackPreDamageResult decl + its doc block (the refusal)"],
    [1004, 1115, "applyAttackPreDamage (the switch a 5th member would join)"],
    [1560, 1650, "the splitter/head rebind + deriveAttackPreDamage read"],
    [1780, 1800, "the SCALING FOLD (scaled = scaledAttackDamage(active,...))"],
    [1940, 1960, "scaledBase"],
    [2530, 2620, "scaledTotal + THE PRE-DAMAGE HOOK + the two rebinds"],
    [186, 400, "scaledAttackDamage's switch (energyOnSelf arm)"],
  ],
  "packages/engine/src/effects.ts": [
    [30440, 30560, "AttackPreDamage union + its four anchors + the reader"],
    [28156, 28530, "deriveAttackDamageMultiplier"],
    [30259, 30440, "splitAttackTrailingClause"],
    [8490, 8505, "attachFromHand op declaration"],
  ],
  "packages/engine/src/interpreter.ts": [
    [2735, 2756, "attachFromHand case arm"],
    [12231, 12245, "attachFromHandOffer"],
    [14012, 14060, "attachFromHandNote"],
  ],
};
const cache = new Map<string, string>();
const read = (f: string) => { if (!cache.has(f)) cache.set(f, readFileSync(`${ROOT}/${f}`, "utf8")); return cache.get(f)!; };
let flagged = 0, examined = 0, broken = 0;
for (const m of MUTANTS as any[]) {
  const regions = REGIONS[m.file];
  if (regions === undefined) continue;
  examined++;
  const src = read(m.file);
  const at = src.indexOf(m.find);
  if (at < 0) { broken++; console.log(`  !! ${m.id}: find does not occur`); continue; }
  const startLine = src.slice(0, at).split("\n").length;
  const endLine = startLine + m.find.split("\n").length - 1;
  for (const [lo, hi, label] of regions) {
    if (startLine <= hi && endLine >= lo) {
      flagged++;
      console.log(`  ${m.file}:${startLine}-${endLine}  ${m.id}  <${label}>`);
      break;
    }
  }
}
console.log(`\nrows examined in the three target files: ${examined}`);
console.log(`rows whose find SPAN intersects a region a D503 build would edit: ${flagged}`);
console.log(`rows whose find does not occur at all (precheck would ERROR): ${broken}`);
