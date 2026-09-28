const tags = ["D437","D447","D455","D465","D475","D482"];
for (const t of tags) {
  const mod = await import(`/home/jofre/.claude/jobs/fd842b9d/tmp/hist-${t}.ts`);
  const M = mod.MUTANTS as any[];
  const g = new Map<string, any[]>();
  for (const m of M) {
    const k = JSON.stringify([m.file, m.find, m.replace, [...(m.expectKilledBy ?? [])].sort(), m.survives ?? null]);
    const a = g.get(k); if (a) a.push(m); else g.set(k, [m]);
  }
  const d = [...g.values()].filter(v => v.length > 1);
  console.log(`${t}: ${M.length} rows -> ${d.length} indistinguishable group(s)${d.length ? ": " + d.map(v=>v.map((m:any)=>m.id).join("+")).join(" ; ") : ""}`);
}
