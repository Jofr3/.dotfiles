const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
console.log("corpus rows:", MUTANTS.length);
const needles = [
  "is a {N} Pokémon",
  "it is now",
  "OPPONENT_ACTIVE_TYPE_CLAUSE",
  "CLAUSE_POKEMON_TYPES",
  "POKEMON_TYPE_BY_CODE",
  "opponentActiveHasType",
  "boardConditionForClause",
  "benchTypeBonus",
  "STATUS_WORDS",
  "defenderStatusOps",
  "statusOf(",
  "DEFENDER_NOW",
  "OPPONENT_ACTIVE_BASIC_KO",
  "opponentActiveIsBasic",
  "Dragon",
  "paralyzed",
];
for (const n of needles) {
  const hits = MUTANTS.filter((m: any) =>
    [
      m.id,
      m.decision,
      m.what,
      m.find,
      m.replace,
      (m.expectKilledBy ?? []).join(" "),
      m.survives?.reason ?? "",
    ]
      .join(" ")
      .includes(n),
  );
  console.log(`\n## ${n}: ${hits.length}`);
  for (const h of hits.slice(0, 40))
    console.log(
      "   ",
      h.id,
      "|",
      h.file,
      "|",
      (h.expectKilledBy ?? []).join(","),
      h.survives ? `SURVIVES(${h.survives.kind})` : "",
    );
}
