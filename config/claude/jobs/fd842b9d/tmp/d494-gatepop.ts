import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
const M = MUTANTS as unknown as Array<Record<string, unknown>>;
// D492's criterion: a String.replace SPECIAL in the replace — $$, $&, $`, $', $n, $<name>.
const SPECIAL = /\$(\$|&|`|'|\d|<[^>]+>)/;
const spliceable = M.filter((m) => SPECIAL.test(String(m.replace)));
console.log("patches LITERALLY population (D492 criterion):", spliceable.length);
for (const m of spliceable) console.log("   ", m.id, "[" + m.decision + "]");
const bare = M.filter((m) => String(m.replace).includes("$"));
console.log("bare `$` over-count would be:", bare.length);
// same file+find+replace+killers+nameFilter+survives → "share a patch"
const key = (m: Record<string, unknown>) =>
  JSON.stringify([m.file, m.find, m.replace, m.nameFilter ?? null]);
const groups = new Map<string, string[]>();
for (const m of M) {
  const k = key(m);
  groups.set(k, [...(groups.get(k) ?? []), String(m.id)]);
}
const shared = [...groups.values()].filter((v) => v.length > 1);
console.log("rows sharing (file,find,replace,nameFilter):", shared.flat().length, "in", shared.length, "group(s)");
for (const g of shared) console.log("   ", g.join(" | "));
