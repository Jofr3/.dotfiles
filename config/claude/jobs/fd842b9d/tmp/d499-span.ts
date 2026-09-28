const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
const ROOT = "/home/jofre/projects/luminous_ui/";

type Region = { file: string; from: number; to: number; label: string };

async function lineOf(file: string, needle: string): Promise<number> {
  const src = await Bun.file(ROOT + file).text();
  const i = src.indexOf(needle);
  if (i < 0) return -1;
  return src.slice(0, i).split("\n").length;
}

const eff = "packages/engine/src/effects.ts";
const atk = "packages/engine/src/attack.ts";

const regions: Region[] = [
  {
    file: eff,
    from: await lineOf(eff, "const ATTACK_COIN_BONUS ="),
    to: await lineOf(eff, "const ATTACK_COIN_CANCEL ="),
    label: "D126 coin anchors (ATTACK_COIN_BONUS .. ATTACK_COIN_CANCEL)",
  },
  {
    file: eff,
    from: await lineOf(eff, "export type AttackCoinFlip ="),
    to: (await lineOf(eff, "export type AttackCoinFlip =")) + 12,
    label: "AttackCoinFlip union declaration",
  },
  {
    file: eff,
    from: await lineOf(eff, "export function deriveAttackCoinFlip("),
    to: await lineOf(eff, "return ATTACK_COIN_CANCEL.test(effect)"),
    label: "deriveAttackCoinFlip body",
  },
  {
    file: atk,
    from: await lineOf(atk, "  let coinBonus = 0;"),
    to: await lineOf(atk, "    if (coinFlip.kind === \"perHeadsThenThreshold\") {"),
    label: "attack.ts coinFlip block",
  },
];

const src: Record<string, string> = {};
for (const f of [eff, atk]) src[f] = await Bun.file(ROOT + f).text();

for (const r of regions) {
  console.log("");
  console.log(
    "### " + r.label + "  [" + r.file + " lines " + r.from + "-" + r.to + "]",
  );
  let n = 0;
  for (const m of MUTANTS as Record<string, string>[]) {
    if (m.file !== r.file) continue;
    const s = src[m.file]!;
    const i = s.indexOf(m.find);
    if (i < 0) continue;
    const start = s.slice(0, i).split("\n").length;
    const end = start + m.find.split("\n").length - 1;
    if (end < r.from || start > r.to) continue;
    n++;
    console.log("   " + m.id + " (" + m.decision + ") lines " + start + "-" + end);
  }
  if (n === 0) console.log("   *** ZERO ROWS INTERSECT THIS REGION BY SPAN ***");
}
