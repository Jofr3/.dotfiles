import * as E from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { legalAttackCorpus, resolvedByAnyReader } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import * as fs from "node:fs";

const rows = fs.readFileSync(process.env.CLAUDE_JOB_DIR + "/tmp/residue.tsv", "utf8")
  .split("\n").filter(Boolean)
  .map((l) => { const i = l.indexOf("\t"); return [Number(l.slice(0, i)), l.slice(i + 1)] as const; });

const BREAK = /(?<=\.)\s+(?=[A-Z(])/;
const IN_PLAY_BODY_MULTIPLY = /^This attack does (\d+) damage for each of your ((?!opponent)[^.]+) in play\.$/;
const DECK_SEARCH_ATTACH_SHAPE = /^Search your deck for (?:a Basic (?:\{([A-Z])\} )?Energy card and attach it|up to (\d+) Basic (?:\{([A-Z])\} )?Energy cards and attach them) to ([^.]+)\. Then, shuffle your deck\./;

function diag(n: number, s: string) {
  const parts = s.split(BREAK);
  const gate = E.splitAttackGateClause(s);
  const trail = E.splitAttackTrailingClause(s);
  const req = E.splitAttackRequirementClause(s);
  const can = E.splitAttackCancelClause(s);
  const flags: string[] = [];
  if (s.endsWith(")")) flags.push("ENDS-PAREN");
  if (/\(/.test(s)) flags.push("HAS-PAREN");
  if (/"/.test(s)) flags.push("HAS-DQUOTE");
  if (/['’]/.test(s)) flags.push("APOSTROPHE");
  if (parts.length > 1) flags.push(`SPLITS-${parts.length}`);
  const lines = [`[${n}p] ${s}`];
  lines.push(`      flags: ${flags.join(" ") || "none"}`);
  lines.push(`      gate=${gate ? JSON.stringify(gate) : "null"}`);
  lines.push(`      trailing=${trail ? JSON.stringify(trail) : "null"}`);
  if (parts.length > 1) {
    const tail = parts[parts.length - 1]!;
    const head = parts.slice(0, -1).join(" ");
    lines.push(`      break-> head=${JSON.stringify(head)}`);
    lines.push(`              tail=${JSON.stringify(tail)}  effectReadsTail=${E.deriveAttackEffect(tail) !== null}  anyReaderHead=${resolvedByAnyReader(head)}`);
  }
  lines.push(`      requirement=${req ? "SPLIT" : "null"}  cancel=${can ? "SPLIT" : "null"}`);
  lines.push(`      IN_PLAY_BODY_MULTIPLY=${IN_PLAY_BODY_MULTIPLY.test(s)}  DECK_SEARCH_ATTACH_SHAPE=${JSON.stringify(DECK_SEARCH_ATTACH_SHAPE.exec(s))}`);
  return lines.join("\n");
}

const FAMS: [string, RegExp][] = [
  ["F-IN-PLAY", /\bin play\b/],
  ["F-DISCARD-COUNT", /for each [^.]*discard pile/],
  ["F-COPY-ATTACK", /use it as this attack/],
  ["F-MOVE-ENERGY", /\bmove (an|all|any (amount|number)) [^.]*Energy/i],
  ["F-SEARCH-ATTACH", /^Search your deck for [^.]*Energy cards? [^.]*attach/],
  ["F-ENERGY-ATTACHED", /for each [^.]*attached to/],
  ["F-REMAINING-HP", /until its remaining HP is \d+\./],
  ["F-HEAL", /^Heal \d+ damage from /],
  ["F-DISCARD-SNIPE", /^Discard [^.]*Energy from this Pokémon/],
  ["F-DAMAGE-COUNTER", /for each damage counter/],
];
for (const [name, re] of FAMS) {
  const hits = rows.filter(([, s]) => re.test(s));
  console.log(`\n##### ${name} :: ${hits.length} sentences / ${hits.reduce((a,[n])=>a+n,0)} printings`);
  for (const [n, s] of hits) console.log(diag(n, s));
}
