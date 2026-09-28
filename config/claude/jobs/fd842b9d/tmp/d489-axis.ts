import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { attackReaderSurface, legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const surface = attackReaderSurface();
const corpus = legalAttackCorpus() as unknown as [number, string][];
function report(label: string, s: string) {
  const hits: string[] = [];
  const vals: Record<string, unknown> = {};
  for (const n of surface) { let v: unknown; try { v = (effects as any)[n](s); } catch (e) { v = `THREW`; } if (v !== null && v !== undefined) { hits.push(n); vals[n] = v; } }
  const inC = corpus.some((r) => r[1] === s);
  console.log(`\n[${label}] inCorpus=${inC} built=${resolvedByAnyReader(s)}`);
  console.log(`   ${JSON.stringify(s)}`);
  if (hits.length) console.log(`   => ${hits.join(",")} :: ${JSON.stringify(vals)}`);
  else console.log(`   => REFUSED`);
}

// Built siblings, for shape
report("SIB scaled-snipe perEnergyOnSelf", "This attack does 20 damage to 1 of your opponent's Pokémon for each Energy attached to this Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)");
report("SIB up-to-3 board discard scaled", "Discard up to 3 {G} Energy cards from your Pokémon. This attack does 70 damage for each card you discarded in this way.");
report("SIB up-to-2 self discard scaled", "Discard up to 2 {M} Energy from this Pokémon. This attack does 120 damage for each card you discarded in this way.");
report("SIB mill scaled (D488)", "Discard the top 3 cards of your deck, and this attack does 80 damage for each Energy card you discarded in this way.");
report("SIB opponent-hand discard (D485)", "Your opponent reveals their hand. Discard all Item cards and Pokémon Tool cards you find there.");

const T = "Discard up to 3 Energy cards from your hand. This attack does 60 damage to 1 of your opponent's Pokémon for each Energy card you discarded in this way. (Don't apply Weakness and Resistance for Benched Pokémon.)";
report("TARGET", T);

// ---- SINGLE-AXIS DELETIONS ----
report("A: del HAND-SOURCE  (source zone -> your Pokémon)", T.replace("from your hand", "from your Pokémon"));
report("A': del HAND-SOURCE  (source zone -> this Pokémon)", T.replace("cards from your hand", "from this Pokémon"));
report("A'': delete whole head sentence", T.replace("Discard up to 3 Energy cards from your hand. ", ""));
report("B: del CHOSEN target", T.replace(" to 1 of your opponent's Pokémon", ""));
report("C: del SCALING tail", T.replace(" for each Energy card you discarded in this way", ""));
report("C': SCALING source -> attached (built count)", T.replace("for each Energy card you discarded in this way", "for each Energy attached to this Pokémon"));
report("D: del W/R parenthetical", T.replace(" (Don't apply Weakness and Resistance for Benched Pokémon.)", ""));
report("E: 'Energy card' -> 'card' in tail", T.replace("for each Energy card you discarded", "for each card you discarded"));

// pairs
report("A+B", T.replace("from your hand", "from your Pokémon").replace(" to 1 of your opponent's Pokémon", ""));
report("A+B+E", T.replace("from your hand", "from your Pokémon").replace(" to 1 of your opponent's Pokémon", "").replace("for each Energy card you discarded", "for each card you discarded"));
report("A+B+E+D", T.replace("from your hand", "from your Pokémon").replace(" to 1 of your opponent's Pokémon", "").replace("for each Energy card you discarded", "for each card you discarded").replace(" (Don't apply Weakness and Resistance for Benched Pokémon.)", ""));
