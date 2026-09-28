import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts";
type Row = { id: string; decision: string; what: string; file: string; find: string; replace: string;
  expectKilledBy?: string[]; killedByCommand?: string[]; survives?: { kind: string; reason: string } };
const rows = MUTANTS as unknown as Row[];
console.log("corpus rows (from the module):", rows.length);
console.log("declared survivors:", rows.filter(r => r.survives !== undefined).length);

// D493: grep the corpus's `replace` column for any line I am about to add, and the
// `find`/`what`/`file` columns for the refusal this slice overturns.
const NEEDLES: [string, RegExp][] = [
  ["Basic Energy (printed noun)",        /Basic Energy/],
  ["CLAUSE_ENERGY_TOKENS",               /CLAUSE_ENERGY_TOKENS/],
  ["attachedEnergyFilter",               /attachedEnergyFilter/],
  ["countAttachedEnergy",                /countAttachedEnergy/],
  ["countEnergyInPlay",                  /countEnergyInPlay/],
  ["energyOnSelf",                       /energyOnSelf/],
  ['"special" literal',                  /"special"/],
  ["specialEnergyUids",                  /specialEnergyUids/],
  ["SELF_ENERGY_MULTIPLY",               /SELF_ENERGY_MULTIPLY/],
  ["basicEnergy filter kind",            /basicEnergy/],
  ["isSpecialEnergy",                    /isSpecialEnergy/],
  ["providesEnergyType",                 /providesEnergyType/],
];
const FIELDS = ["id","decision","what","file","find","replace"] as const;
for (const [label, re] of NEEDLES) {
  const hits = rows.filter(r => FIELDS.some(f => re.test(String(r[f] ?? ""))));
  console.log(`\n### ${label}: ${hits.length} row(s)`);
  for (const h of hits) {
    const where = FIELDS.filter(f => re.test(String(h[f] ?? "")));
    console.log(`  [${h.decision}] ${h.id}  (${h.file})  fields:{${where.join(",")}}${h.survives?"  SURVIVOR:"+h.survives.kind:""}`);
  }
}
