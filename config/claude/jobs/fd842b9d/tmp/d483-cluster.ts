#!/usr/bin/env bun
// D483 — the cluster measurement, published as a PATTERN over all 640 rows.
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
import { builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";

const out: string[] = [];
const corpus = legalAttackCorpus();

// PATTERN P1 — the printed CLASS-NARROWING token, anywhere in the sentence.
// `Pokémon ex` / `Pokémon V` (and the V-family spellings) used as a NOUN.
const CLASS = /Pokémon (ex|V|VMAX|VSTAR|V-UNION)\b/;
// PATTERN P2 — the narrowing appearing on the OPPONENT'S side (a target).
const TARGET = /opponent's [^.]*?Pokémon (ex|V|VMAX|VSTAR|V-UNION)\b/;

const tally = (label: string, re: RegExp, pool: readonly (readonly [number, string])[]) => {
  const hit = pool.filter(([, t]) => re.test(t));
  const printings = hit.reduce((a, [u]) => a + u, 0);
  out.push(`\n### ${label}: ${hit.length} sentences / ${printings} printings`);
  for (const [u, t] of hit) out.push(`  [${u}p] ${t}`);
};

const residue = corpus.filter(([, t]) => !builds(t));
out.push(`corpus ${corpus.length} sentences / ${corpus.reduce((a, [u]) => a + u, 0)} printings`);
out.push(`residue ${residue.length} sentences / ${residue.reduce((a, [u]) => a + u, 0)} printings`);

tally("P1 over WHOLE CORPUS (any Pokemon-ex/V noun)", CLASS, corpus);
tally("P1 over RESIDUE", CLASS, residue);
tally("P2 over RESIDUE (opponent-side target narrowing)", TARGET, residue);

// P3 — the narrowing on YOUR side, for contrast.
tally("P3 over RESIDUE (your-side narrowing)", /your (?!opponent)[^.]*?Pokémon (ex|V|VMAX|VSTAR|V-UNION)\b/, residue);

// P1 over BUILT, so the built/unbuilt split of the printed word is visible.
const built = corpus.filter(([, t]) => builds(t));
tally("P1 over BUILT", CLASS, built);

await Bun.write("/home/jofre/.claude/jobs/fd842b9d/tmp/d483-cluster.txt", out.join("\n") + "\n");
