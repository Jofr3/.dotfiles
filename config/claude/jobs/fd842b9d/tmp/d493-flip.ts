import * as fs from "node:fs";
import * as path from "node:path";
// D449: run the NEW anchor over every string literal in the package and name every rung that will flip.
const WIDE = /^This attack['’]s damage isn['’]t affected by (?:(Weakness or Resistance, or by any effects on your opponent['’]s Active Pokémon)|(Weakness or Resistance)|(Resistance)|(any effects on your opponent['’]s Active Pokémon)|(Weakness))\.$/;
const OLD  = /^This attack['’]s damage isn['’]t affected by (?:(Weakness or Resistance, or by any effects on your opponent['’]s Active Pokémon)|(Weakness or Resistance)|(Resistance)|(any effects on your opponent['’]s Active Pokémon))\.$/;
const roots = ["packages/engine/src","packages/schema/src","src","apps/api/src","scripts"];
const files: string[] = [];
function walk(d:string){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name);
  if (e.isDirectory()) { if (e.name==="node_modules") continue; walk(p); } else if (/\.(ts|tsx)$/.test(e.name)) files.push(p); } }
for (const r of roots) if (fs.existsSync(r)) walk(r);
console.log("files scanned:", files.length);
// double-quoted, single-quoted and backtick literals, plus corpus data lines
const LIT = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\$]|\\.)*)`/g;
let flips = 0;
for (const f of files) {
  const src = fs.readFileSync(f,"utf8"); const lines = src.split("\n");
  for (let i=0;i<lines.length;i++){
    const L = lines[i]!;
    LIT.lastIndex = 0; let m: RegExpExecArray | null;
    while ((m = LIT.exec(L)) !== null) {
      const raw = m[1] ?? m[2] ?? m[3]; if (raw===undefined) continue;
      const s = raw.replace(/\\"/g,'"').replace(/\\'/g,"'").replace(/\\`/g,"`").replace(/\\n/g,"\n");
      if (!OLD.test(s) && WIDE.test(s)) { flips++; console.log(`FLIP ${f}:${i+1}\n     ${JSON.stringify(s)}\n     line: ${L.trim().slice(0,180)}`); }
    }
  }
}
console.log("\nliterals that CHANGE answer under the widened anchor:", flips);
console.log("⚠️ what this scan CANNOT see: template literals with interpolation, strings built by .replace/.replaceAll (e.g. the `curly()` U+2019 fold), strings assembled from constants, and the CORPUS data lines (which are inside one big backtick literal, scanned as a single literal).");
// corpus data lines separately
const corpus = fs.readFileSync("packages/engine/src/censusAttackCorpus.ts","utf8").split("\n");
let cf=0;
for (let i=0;i<corpus.length;i++){ const l=corpus[i]!; const c=l.indexOf(" ");
  if (c>0 && /^\d+$/.test(l.slice(0,c))) { const s=l.slice(c+1); if(!OLD.test(s)&&WIDE.test(s)){cf++;console.log(`CORPUS FLIP line ${i+1}: ${JSON.stringify(s)}`);} } }
console.log("corpus data lines that change answer:", cf);
