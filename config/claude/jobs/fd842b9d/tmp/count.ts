import { legalAttackCorpus, resolvedByAnyReader, attackReaderSurface } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const rows = legalAttackCorpus();
let s = 0, p = 0;
for (const [n, t] of rows) if (!resolvedByAnyReader(t)) { s++; p += n; }
console.log("readers:", attackReaderSurface().length, attackReaderSurface().join(","));
console.log("!resolvedByAnyReader:", s, "sentences /", p, "printings");
let rs=0, rp=0;
for (const [n, t] of rows) if (resolvedByAnyReader(t)) { rs++; rp += n; }
console.log("resolvedByAnyReader:", rs, "/", rp);
console.log("total:", rows.length, rows.reduce((a,[n])=>a+n,0));
