const P = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const { legalAttackCorpus } = await import(P + "censusAttackCorpus");
const rows = legalAttackCorpus() as unknown as [number, string][];
for (const [n, s] of rows.filter(([, s]) => /that ha[sv]e? any damage counters/i.test(s))) console.log(n, "|", s);
