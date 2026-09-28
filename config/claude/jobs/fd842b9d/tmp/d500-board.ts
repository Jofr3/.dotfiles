import { FIXTURE_POOL } from "/home/jofre/projects/luminous_ui/packages/engine/src/testFixtures.ts";
import { energyProvidesOf, isSpecialEnergy, isEnergyCard } from "/home/jofre/projects/luminous_ui/packages/engine/src/cards.ts";
const rows: string[] = [];
for (const [id, card] of Object.entries(FIXTURE_POOL)) {
  if (!isEnergyCard(card)) continue;
  rows.push(`${id.padEnd(26)} energyType=${String((card as {energyType?: string}).energyType).padEnd(8)} name=${JSON.stringify(card.name).padEnd(28)} provides=${energyProvidesOf(card).padEnd(10)} special=${isSpecialEnergy(card)}`);
}
rows.sort();
console.log("Energy cards in FIXTURE_POOL:", rows.length);
for (const r of rows) console.log("  " + r);
