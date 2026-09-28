import { FIXTURE_POOL } from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures";
const S = "Each player draws 3 cards.";
for (const [id, card] of Object.entries(FIXTURE_POOL as Record<string, any>)) {
  (card.attacks ?? []).forEach((a: any, i: number) => { if (a.effect === S) console.log(id, "index", i, JSON.stringify(a.name), "dmg", a.damage); });
}
