import { rows, builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const built = corpus.filter(([, t]) => builds(t)).map(([, t]) => t);
const opaque = rows.filter((r) => r.cls === "OPAQUE");
const SUBMAX = 4;
function regions(a: string[], b: string[]) {
  const m=a.length,n=b.length;
  const D: number[][] = Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=> i===0?j : j===0?i : 0));
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)D[i][j]=Math.min(D[i-1][j]+1,D[i][j-1]+1,D[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  let i=m,j=n; const ops:string[]=[];
  while(i>0||j>0){ if(i>0&&j>0&&D[i][j]===D[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){ops.push(a[i-1]===b[j-1]?"=":"s");i--;j--;} else if(i>0&&D[i][j]===D[i-1][j]+1){ops.push("d");i--;} else {ops.push("i");j--;} }
  ops.reverse();
  const regs:{alen:number;blen:number}[]=[]; let cur:any=null;
  for(const o of ops){ if(o==="="){cur=null;continue;} if(cur===null){cur={alen:0,blen:0};regs.push(cur);} if(o==="s"){cur.alen++;cur.blen++;} else if(o==="d")cur.alen++; else cur.blen++; }
  return regs;
}
function minK(text: string): number | null {
  const a = text.split(" "); let best: number | null = null;
  for (const b0 of built) { const rg = regions(a, b0.split(" ")); if (rg.some(x=>x.alen>SUBMAX||x.blen>SUBMAX)) continue; if (best===null||rg.length<best) best=rg.length; }
  return best;
}
const far = opaque.filter((r) => minK(r.text) === null);
console.log(`FAR (no bounded-region edit reaches a built sentence): ${far.length} rows / ${far.reduce((s,r)=>s+r.units,0)}p\n`);
const residueSet = new Set(rows.map((r)=>r.text));
const M: [string, RegExp][] = [
  ["COPY-ATTACK", /use it as this attack/],
  ["SCHEMA-BANNER", /\b(Ancient|Future|Tera)\b/],
  ["NAMED-ATTACK", /used (Angelite|Rollout)|Hyper Fang|United Wings/],
  ["CARD-NAME-COUNT", /has "[^"]+" in its name|your Drifloon and Drifblim|number of Fennel cards/],
  ["BOTH-SIDES-BOARD", /both yours and your opponent's/],
  ["PRIZE-ZONE", /face-down Prize|face up|Prize card your opponent has taken|Prize cards? remaining|take 2 more Prize/],
  ["VARIABLE-MAX", /up to the number of|number of cards up to/],
  ["OPP-HAND-CHOICE", /opponent (chooses|discards a card)|your opponent shuffle/],
];
function bs(rx: RegExp) { let b=0,bu=0; for (const [u,t] of corpus) if (rx.test(t) && !residueSet.has(t)) {b++;bu+=u;} return [b,bu] as const; }
const lab = new Map<string,string>();
for (const r of far) for (const [n,rx] of M) { if (bs(rx)[0]===0 && rx.test(r.text)) { lab.set(r.text,n); break; } }
for (const [n,rx] of M) { const [b,bu]=bs(rx); const hits=far.filter(r=>lab.get(r.text)===n); console.log(`${n.padEnd(18)} builtSide ${b}/${bu}  ${hits.length===0?"(not a blocker / no hits)":`labels ${hits.length}/${hits.reduce((s,r)=>s+r.units,0)}`}`); }
const rest = far.filter(r=>!lab.has(r.text));
console.log(`\nUNEXPLAINED ${rest.length} / ${rest.reduce((s,r)=>s+r.units,0)}p`);
for (const r of rest) console.log(`   ${String(r.units).padStart(2)}p ${r.text.slice(0,105)}`);
