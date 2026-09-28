import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const rows = legalAttackCorpus() as unknown as [number, string][];
const P = (xs: [number, string][]) => `${xs.length}s/${xs.reduce((a, [n]) => a + n, 0)}p`;
const cands: [string, RegExp][] = [
  ["TIGHT   bonus + literal W-only tail", /^If (.+), this attack does (\d+) more damage\. This attack['’]s damage isn['’]t affected by Weakness\.$/],
  ["WIDER-1 bonus + W-or-R alternation tail", /^If (.+), this attack does (\d+) more damage\. This attack['’]s damage isn['’]t affected by (?:Weakness or Resistance|Weakness|Resistance)\.$/],
  ["WIDER-2 bonus + ANY tail", /^If (.+), this attack does (\d+) more damage\. (.+)$/],
  ["WIDER-3 optional-group on the shipped anchor", /^If (.+), this attack does (\d+) more damage\.(?: This attack['’]s damage isn['’]t affected by Weakness\.)?$/],
  ["SHIPPED CONDITIONAL_DAMAGE_BONUS", /^If (.+), this attack does (\d+) more damage\.$/],
  ["SHIPPED-with-suppr: any head + W-only tail", /^(.+)\. This attack['’]s damage isn['’]t affected by Weakness\.$/],
];
for (const [label, re] of cands) {
  const hits = rows.filter(([, t]) => re.test(t));
  console.log(`${label}\n   ${re}\n   claims ${P(hits)}`);
  for (const [n, t] of hits) console.log(`      ${n}p  ${t}`);
  console.log();
}
