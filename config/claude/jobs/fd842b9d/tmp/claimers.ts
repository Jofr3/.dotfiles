const B = "/home/jofre/projects/luminous_ui/packages/engine/src/";
const eff: any = await import(B + "effects");
const P = "Flip a coin. If heads, your opponent's Active Pokémon is now Paralyzed and Poisoned. If tails, your opponent's Active Pokémon is now Confused.";
const readers = Object.entries(eff).filter(([k, v]) => k.startsWith("deriveAttack") && typeof v === "function");
console.log("reader surface:", readers.length);
for (const [k, fn] of readers as any[]) {
  const v = fn(P);
  if (v !== null && v !== undefined) console.log("  CLAIMS:", k);
}
const { registryCardIds, programFor } = await import(B + "registry");
console.log("registry rows claiming it:", registryCardIds().filter((id: string) => JSON.stringify(programFor(id) ?? {}).includes("If tails")).length);
