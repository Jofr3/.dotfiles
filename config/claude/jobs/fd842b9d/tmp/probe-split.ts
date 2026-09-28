import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";

const HEAD = "Your opponent reveals their hand.";
const TAIL = "Discard all Item cards and Pokémon Tool cards you find there.";
const FULL = `${HEAD} ${TAIL}`;

// 1. The BREAK: does the printed string split into exactly head + tail?
const BREAK = /(?<=\.)\s+(?=[A-Z(])/;
const parts = FULL.split(BREAK);
console.log("parts:", JSON.stringify(parts));
console.log("head matches:", parts[0] === HEAD, " tail matches:", parts[1] === TAIL);

// 2. D466's DRIVE: with a head that builds and a tail deriveAttackEffect ALREADY
//    claims, does the splitter compose? Substitute a built tail for the unbuilt one.
for (const t of [
  "Draw 3 cards.",
  "Your opponent discards a card from their hand.",
  "Discard a card you find there.",
]) {
  const s = `${HEAD} ${t}`;
  console.log(
    `\n"${t}"\n  deriveAttackEffect(tail) = ${JSON.stringify(effects.deriveAttackEffect(t))}` +
      `\n  split(whole) = ${JSON.stringify(effects.splitAttackTrailingClause(s))}`,
  );
}

// 3. Is the sibling built sentence claimed WHOLE or via the splitter?
const SIB = "Your opponent reveals their hand. Discard a card you find there.";
console.log(
  "\nSIBLING whole =",
  JSON.stringify(effects.deriveAttackEffect(SIB)),
  "\nSIBLING split =",
  JSON.stringify(effects.splitAttackTrailingClause(SIB)),
);
