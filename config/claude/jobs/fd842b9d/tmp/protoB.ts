import { rows, builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const built = corpus.filter(([, t]) => builds(t)).map(([, t]) => t);
const opaque = rows.filter((r) => r.cls === "OPAQUE");
const SUBMAX = 4;
type Reg = { alen: number; blen: number };
/** Levenshtein minimising (max region size, then region count, then distance). */
function regionsOf(a: string[], b: string[]): Reg[] {
  const m=a.length,n=b.length;
  const D: number[][] = Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=> i===0?j : j===0?i : 0));
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)D[i][j]=Math.min(D[i-1][j]+1,D[i][j-1]+1,D[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  let i=m,j=n; const ops:string[]=[];
  while(i>0||j>0){
    if(i>0&&j>0&&D[i][j]===D[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){ops.push(a[i-1]===b[j-1]?"=":"s");i--;j--;}
    else if(i>0&&D[i][j]===D[i-1][j]+1){ops.push("d");i--;}
    else {ops.push("i");j--;}
  }
  ops.reverse();
  const regs:Reg[]=[]; let cur:Reg|null=null;
  for(const o of ops){ if(o==="="){cur=null;continue;} if(cur===null){cur={alen:0,blen:0};regs.push(cur);} if(o==="s"){cur.alen++;cur.blen++;} else if(o==="d")cur.alen++; else cur.blen++; }
  return regs;
}
const hist: Record<number,[number,number]> = {};
const lines: string[] = [];
for (const r of opaque) {
  const a = r.text.split(" ");
  let bestK = Infinity, bestT = "", bestR: Reg[] = [];
  for (const b0 of built) {
    const rg = regionsOf(a, b0.split(" "));
    if (rg.some((x)=>x.alen>SUBMAX||x.blen>SUBMAX)) continue;   // every region must be small
    if (rg.length < bestK) { bestK = rg.length; bestT = b0; bestR = rg; }
  }
  const k = bestK === Infinity ? 99 : bestK;
  const t = hist[k] ?? [0,0]; t[0]++; t[1]+=r.units; hist[k]=t;
  if (k < 99) lines.push(`k=${k}  ${r.text.slice(0,58)}\n       → ${bestT.slice(0,58)}   regions=${JSON.stringify(bestR)}`);
}
console.log(`=== k-REGION PROBE (every region <= ${SUBMAX} tokens per side) ===`);
for (const [k,v] of Object.entries(hist).sort((a,b)=>Number(a[0])-Number(b[0]))) console.log(`  k=${k==="99"?"none":k}: ${v[0]} rows / ${v[1]}p`);
console.log("\n"+lines.join("\n"));
