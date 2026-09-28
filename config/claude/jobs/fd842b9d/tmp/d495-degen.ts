import { line } from "/home/jofre/.claude/jobs/fd842b9d/tmp/d495-probe.ts";
const S = [
  // the print
  "Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't attack.",
  // GATE axis candidates (gate slot inhabitants)
  "During your opponent's next turn, the Defending Pokémon can't attack.",
  "Flip a coin. If tails, during your opponent's next turn, the Defending Pokémon can't attack.",
  // FACE / SEAT / SUBJECT built references
  "Flip a coin. If tails, during your next turn, this Pokémon can't attack.",
  "During your next turn, this Pokémon can't attack.",
  "Flip a coin. If heads, during your next turn, this Pokémon can't attack.",
  // VERB axis
  "During your opponent's next turn, the Defending Pokémon can't retreat.",
  "During your opponent's next turn, the Defending Pokémon can't use attacks.",
  "Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't retreat.",
  "Flip a coin. If heads, during your opponent's next turn, the Defending Pokémon can't use attacks.",
  // CONSEQUENT axis: the built gated consequent
  "Flip a coin. If heads, during your opponent's next turn, prevent all damage done to this Pokémon by attacks.",
  "During your opponent's next turn, prevent all damage done to this Pokémon by attacks.",
  // SUBJECT axis inside the opponent frame
  "During your opponent's next turn, that Pokémon can't attack.",
  "Flip a coin. If heads, during your opponent's next turn, that Pokémon can't attack.",
];
for (const s of S) console.log(line(s));
