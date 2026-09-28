import * as effects from "/home/jofre/projects/luminous_ui/packages/engine/src/effects";
const rows = [
  "Discard a card from your hand. If you do, draw 2 cards.",
  "Discard a card from your hand. If you do, draw 3 cards.",
  "Discard a card from your hand. If you do, your opponent discards a card from their hand.",
];
const readers: [string, (t:string)=>unknown][] = [];
for (const [name, value] of Object.entries(effects)) {
  if (name.startsWith("deriveAttack") && typeof value === "function") readers.push([name, value as any]);
}
readers.sort(([a],[b])=> a<b?-1:a>b?1:0);
console.log("READERS", readers.length, readers.map(([n])=>n).join(" "));
for (const t of rows) {
  console.log("\n=== " + t);
  for (const [n, r] of readers) {
    let out: unknown; try { out = r(t); } catch (e) { console.log("  " + n + " THREW " + (e as Error).message); continue; }
    if (out !== null && out !== undefined) console.log("  " + n + " => " + JSON.stringify(out));
  }
}
