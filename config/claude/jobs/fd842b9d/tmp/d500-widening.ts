import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
import { attackReaderSurface, legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
const surface = attackReaderSurface();
const rows = legalAttackCorpus() as unknown as [number, string][];
function claimers(s: string): string[] {
  const out: string[] = [];
  for (const n of surface) {
    const f = (effects as Record<string, unknown>)[n];
    if (typeof f !== "function") continue;
    let r: unknown = null;
    try { r = (f as (t: string) => unknown)(s); } catch { r = null; }
    if (r !== null && r !== undefined) out.push(n);
  }
  return out;
}
// D472 discipline: what would the token widening claim over ALL 640 rows?
// `attachedEnergyFilter` is a pure Map lookup; `Special` already resolves to the
// SAME shape (a card CATEGORY). So substituting the standalone token Basic -> Special
// is an exact simulation of "Basic now resolves", for every site the map feeds.
let refusedToday = 0, newlyClaimed = 0, carriesBasic = 0;
const gained: string[] = [];
for (const [line, text] of rows) {
  const today = claimers(text);
  if (today.length === 0) refusedToday++;
  if (!/\bBasic\b/.test(text)) continue;
  carriesBasic++;
  const sub = text.replace(/\bBasic\b/g, "Special");
  const after = claimers(sub);
  if (today.length === 0 && after.length > 0) {
    newlyClaimed++;
    gained.push(`  line ${line}: ${text}\n      -> via ${after.join(",")}  (probe: ${sub})`);
  }
}
console.log("corpus rows:", rows.length, "| refused by all 13 today:", refusedToday);
console.log("rows carrying the standalone token `Basic`:", carriesBasic);
console.log("rows REFUSED today that the token widening would CLAIM:", newlyClaimed);
console.log(gained.join("\n"));

// The three other carriers the shared map feeds — are their `Basic` spellings printed?
console.log("\n=== other CLAUSE_ENERGY_TOKENS carriers: is a `Basic` spelling PRINTED? ===");
const needles: [string, RegExp][] = [
  ["D128 coin-per-energy  /^Flip a coin for each .* Energy attached/", /^Flip a coin for each .*Energy attached/],
  ["D118 conditional clause /has any .* Energy attached/",             /has any .*Energy attached/],
  ["energy-scaling family  /for each .*Energy attached to/",           /for each .*Energy attached to/],
];
for (const [label, re] of needles) {
  const hits = rows.filter(r => re.test(r[1]));
  const withBasic = hits.filter(r => /\bBasic\b/.test(r[1]));
  console.log(`  ${label}\n     total ${hits.length} rows, of which carry \`Basic\`: ${withBasic.length}`);
  for (const h of withBasic) console.log(`       line ${h[0]}: ${h[1]}`);
}
