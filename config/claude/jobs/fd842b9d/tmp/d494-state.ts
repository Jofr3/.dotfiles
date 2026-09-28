import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";

const names = attackReaderSurface();
const mod = E as unknown as Record<string, unknown>;
console.log("READER SURFACE (" + names.length + "):");
for (const n of names) console.log("   " + n);
console.log();

type R = (s: string) => unknown;
function claimers(s: string): string[] {
  const out: string[] = [];
  for (const n of names) {
    const f = mod[n] as R;
    let v: unknown;
    try { v = f(s); } catch (e) { out.push(n + "!THREW"); continue; }
    if (v !== null && v !== undefined) out.push(n);
  }
  return out;
}
const SPLITTERS = ["splitAttackRequirementClause", "splitAttackCancelClause", "splitAttackGateClause", "splitAttackTrailingClause"] as const;
function splits(s: string): string[] {
  const out: string[] = [];
  for (const n of SPLITTERS) {
    const f = mod[n] as R;
    let v: unknown;
    try { v = f(s); } catch { out.push(n + "!THREW"); continue; }
    out.push(n + " = " + JSON.stringify(v));
  }
  return out;
}

const TABLE: [string, string][] = [
  ["A  at least 3 {D}  (brief says BUILDS)", "If you have at least 3 {D} Energy in play, this attack does 50 more damage."],
  ["B  3 or more {D}", "If you have 3 or more {D} Energy in play, this attack does 50 more damage."],
  ["C  at least 3 untyped", "If you have at least 3 Energy in play, this attack does 50 more damage."],
  ["D  3 or more untyped (337 head @50)", "If you have 3 or more Energy in play, this attack does 50 more damage."],
  ["E  337 HEAD verbatim (@70)", "If you have 3 or more Energy in play, this attack does 70 more damage."],
  ["F  337 FULL (the print)", "If you have 3 or more Energy in play, this attack does 70 more damage. This attack's damage isn't affected by Weakness."],
  ["G  337 TAIL alone", "This attack's damage isn't affected by Weakness."],
  ["H  W-or-R tail alone", "This attack's damage isn't affected by Weakness or Resistance."],
];

for (const [label, s] of TABLE) {
  const c = claimers(s);
  console.log("── " + label);
  console.log("   " + JSON.stringify(s));
  console.log("   claimers: " + (c.length ? c.join(", ") : "NONE — REFUSED " + names.length + "/" + names.length));
  for (const line of splits(s)) console.log("   " + line);
  console.log("   resolvedByAnyReader = " + resolvedByAnyReader(s));
  console.log();
}

// corpus membership check for the two rows
const rows = legalAttackCorpus() as unknown as [number, string][];
console.log("corpus size:", rows.length, "printings:", rows.reduce((a, [n]) => a + n, 0));
for (const [label, s] of TABLE) {
  const hit = rows.find(([, t]) => t === s);
  console.log((label + "                                           ").slice(0, 42), hit ? "IS a corpus row @ " + hit[0] + "p" : "not a corpus row");
}
