import { legalAttackCorpus, resolvedByAnyReader, attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus.ts";
import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects.ts";
const mod = E as unknown as Record<string, unknown>;
type R = (s: string) => unknown;
const rows = legalAttackCorpus() as unknown as [number, string][];
const SPL = ["splitAttackRequirementClause","splitAttackCancelClause","splitAttackGateClause","splitAttackTrailingClause"];
function served(t: string): boolean {
  if (resolvedByAnyReader(t)) return true;
  for (const n of SPL) { let v: unknown; try { v = (mod[n] as R)(t); } catch { continue; }
    if (v !== null && v !== undefined) {
      const o = v as Record<string, string>;
      const head = o.head ?? o.body ?? "";
      const tail = o.tail ?? "";
      if (head !== "" && resolvedByAnyReader(head) && (tail === "" || resolvedByAnyReader(tail))) return true;
    }
  }
  return false;
}
const residue = rows.filter(([, t]) => !served(t));
console.log("corpus:", rows.length, "sentences /", rows.reduce((a,[n])=>a+n,0), "printings");
console.log("reader-only residue:", rows.filter(([,t])=>!resolvedByAnyReader(t)).length, "sentences /", rows.filter(([,t])=>!resolvedByAnyReader(t)).reduce((a,[n])=>a+n,0), "printings");
console.log("residue (reader + splitters):", residue.length, "sentences /", residue.reduce((a,[n])=>a+n,0), "printings");
console.log();

// ── THE POPULATION EACH BRANCH COULD POSSIBLY TOUCH ────────────────────────────
const pop = (label: string, re: RegExp) => {
  const hits = rows.filter(([, t]) => re.test(t));
  const un = hits.filter(([, t]) => !served(t));
  console.log(`${label}\n   pattern ${re}\n   corpus hits ${hits.length}s/${hits.reduce((a,[n])=>a+n,0)}p; of those UNSERVED ${un.length}s/${un.reduce((a,[n])=>a+n,0)}p`);
  for (const [n, t] of hits) console.log(`      ${served(t) ? "SERVED  " : "UNSERVED"} ${n}p  ${t}`);
  console.log();
};
pop("[P1] any 'Energy in play'", /Energy in play/);
pop("[P2] any ' in play' at all", / in play/);
pop("[P3] any 'or more'", /or more/);
pop("[P4] any 'at least'", /at least/);
pop("[P5] any \"isn't affected by Weakness\" (either scope)", /isn['’]t affected by Weakness/);
pop("[P6] the bare-Weakness suppression tail exactly", /This attack['’]s damage isn['’]t affected by Weakness\./);
