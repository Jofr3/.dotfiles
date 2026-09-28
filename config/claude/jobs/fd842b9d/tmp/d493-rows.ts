const { MUTANTS } = await import("/home/jofre/projects/luminous_ui/scripts/mutation/mutants.ts");
for (const id of ["D409-tail-guard-widened-to-any-reader","D409-head-quantifier-narrowed-to-effect-reader","D469-board-counter-anchor-loses-the-trailing-dollar","D467-counter-arm-builds-the-unfiltered-member","D448-unprinted-pair-guard-dropped"]) {
  const m = (MUTANTS as any[]).find(x=>x.id===id);
  if (!m) { console.log("MISSING", id); continue; }
  console.log("################ " + id + " ################");
  console.log("decision:", m.decision, " file:", m.file, " killers:", JSON.stringify(m.expectKilledBy), " survives:", JSON.stringify(m.survives ?? null));
  console.log("--- what ---\n" + m.what);
  console.log("--- find ---\n" + m.find);
  console.log("--- replace ---\n" + m.replace);
  console.log();
}
