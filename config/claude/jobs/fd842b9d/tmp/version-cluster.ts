#!/usr/bin/env bun
/** D487 — THE VERSION-COSTING CLUSTER, MEASURED.
 *
 * Question: over all 640 corpus rows, how many RESIDUE sentences are blocked
 * ONLY by a change that would move `MATCH_RECORD_VERSION` 29 → 30?
 *
 * THE RULE, read out of `apps/api/src/lobby/match.ts` rather than assumed:
 *   · D335 — "THE TEST IS 'WOULD AN OLD RECORD MEAN SOMETHING ELSE', NOT 'IS THE
 *     TYPE STILL ASSIGNABLE'."
 *   · D359 — "a WIDENING is free and a RENAME is not."
 *   · D326 — "Widening an enum is not a bump (D125); adding a required key always is."
 * So exactly THREE shapes cost a bump, all at a PERSISTED address:
 *   (i) a new REQUIRED key on a structure a v29 record already contains;
 *   (ii) a RENAME of a type / field / key at such an address;
 *   (iii) any change that re-MEANS an existing v29 byte string.
 *
 * THE CONSEQUENCE, which is what makes this measurable: a residue row is bought
 * by ADDING vocabulary — a new op, a new union member, a new value on an existing
 * field, or a new OPTIONAL field. None of those four is one of the three costing
 * shapes, because a residue sentence is BY CONSTRUCTION a distinction no shipped
 * printing prints, so the pre-change behaviour is always available as the
 * absent-key / absent-member default. A bump can only be FORCED when the repair
 * must RESHAPE a structure a v29 record already holds — and the only such
 * structures reachable from an attack sentence are the DURATED `InPlayPokemon` /
 * `GameState` records (D326 `lastKoMarks`, D335 `restTo`, D435 `ScheduledEffect`).
 *
 * THE SWEEP, therefore: partition the residue by whether the sentence prints a
 * DURATION or a SCHEDULE at all. A row that does not cannot reach a durated
 * record and is version-free by construction. A row that does is printed in full
 * so the reshape question is answered against the shipped durated fields by hand.
 */
import {
  legalAttackCorpus,
  resolvedByAnyReader,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import {
  splitAttackGateClause,
  splitAttackTrailingClause,
} from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
import { readFileSync } from "node:fs";

const CENSUS = "/home/jofre/projects/luminous_ui/packages/engine/src/censusAtHead.test.ts";
function registrySentences(): Set<string> {
  const src = readFileSync(CENSUS, "utf8");
  const head = src.indexOf("const REGISTRY_ATTACKS: readonly (readonly [string, string])[] = [");
  const end = src.indexOf("\n];", head);
  const block = src.slice(head, end).split("\n").map((l) => l.replace(/\s*\/\/.*$/, "")).join("\n");
  const PAIR = /\[\s*"(sv[a-z0-9.]*-\d+)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,?\s*\]/g;
  const out = new Set<string>();
  for (const m of block.matchAll(PAIR)) out.add((m[2] ?? "").replace(/\\"/g, '"'));
  return out;
}
const REGISTRY = registrySentences();
function builds(text: string): boolean {
  if (resolvedByAnyReader(text)) return true;
  if (REGISTRY.has(text)) return true;
  const gate = splitAttackGateClause(text);
  if (gate !== null && gate.body !== "" && resolvedByAnyReader(gate.body)) return true;
  return splitAttackTrailingClause(text) !== null;
}

const corpus = legalAttackCorpus();
const residue = corpus.filter(([, t]) => !builds(t));
const printings = (rows: typeof corpus) => rows.reduce((s, [n]) => s + n, 0);
console.log(`population ${String(corpus.length)} sentences / ${String(printings(corpus))} printings`);
console.log(`RESIDUE    ${String(residue.length)} sentences / ${String(printings(residue))} printings`);

/** THE DURATION / SCHEDULE MARKERS — the only printed phrases that can force a
 *  value to OUTLIVE the op that wrote it, and therefore the only ones that can
 *  reach a durated `InPlayPokemon` / `GameState` record at all. Everything else
 *  resolves inside one op and touches only op VOCABULARY. */
const DURATED = [
  /\bduring (?:your|their) (?:opponent's )?next turn\b/i,
  /\bduring (?:your|their) last turn\b/i,
  /\bduring this turn\b/i,
  /\buntil the end of\b/i,
  /\bat the end of\b/i,
  /\bfor the rest of (?:this|the) game\b/i,
  /\bbetween turns\b/i,
  /\bnext turn\b/i,
  /\bthis turn\b/i,
  /\bremains? face up\b/i,
  /\byou win this game\b/i,
];
const durated = residue.filter(([, t]) => DURATED.some((re) => re.test(t)));
const vocab = residue.filter(([, t]) => !DURATED.some((re) => re.test(t)));
console.log(
  `\nPARTITION — can the repair reach a DURATED persisted record at all?\n` +
    `  NO  (op vocabulary only, version-free BY CONSTRUCTION): ${String(vocab.length)} sentences / ${String(printings(vocab))} printings\n` +
    `  YES (prints a duration or a schedule, must be read by hand): ${String(durated.length)} sentences / ${String(printings(durated))} printings`,
);
console.log(`\n=== THE ${String(durated.length)} ROWS THAT PRINT A DURATION ===`);
for (const [n, t] of durated) console.log(`  ${String(n)}p  ${t}`);

/** The brief's three named claims, re-asked against the live readers. */
console.log(`\n=== THE BRIEF'S THREE, RE-ASKED ===`);
const THREE = [
  "Shuffle your hand into your deck. Then, draw a card for each card in your opponent's hand.",
  "Each player draws 3 cards.",
  "Draw 3 cards from the bottom of your deck.",
];
for (const t of THREE) {
  const row = corpus.find(([, x]) => x === t);
  console.log(
    `  ${row === undefined ? "ABSENT FROM CORPUS" : `${String(row[0])}p`}  builds=${String(builds(t))}  reader=${String(resolvedByAnyReader(t))}  durated=${String(DURATED.some((re) => re.test(t)))}  «${t}»`,
  );
}
