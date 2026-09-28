import { FIXTURE_POOL } from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures";
for (const id of ["fix-suction","fix-prizewheel","fix-toolstrip","fix-preseam"]) {
  const c = (FIXTURE_POOL as any)[id];
  console.log(`\n### ${id}  (${c.name}, hp ${c.hp}, stage ${c.stage})`);
  (c.attacks ?? []).forEach((a: any, i: number) => console.log(`  [${i}] ${JSON.stringify(a.name)} dmg=${String(a.damage)} :: ${JSON.stringify(a.effect)}`));
}
