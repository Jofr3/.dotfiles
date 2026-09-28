import { rows, builds } from "/home/jofre/projects/luminous_ui/scripts/residue-census";
import { legalAttackCorpus } from "/home/jofre/projects/luminous_ui/packages/engine/src/censusAttackCorpus";
const corpus = legalAttackCorpus();
const built = corpus.filter(([, t]) => builds(t)).map(([, t]) => t);
const opaque = rows.filter((r) => r.cls === "OPAQUE");
type Reg = { ai: number; alen: number; blen: number };
/** token Levenshtein with backtrace -> list of maximal disjoint edit regions */
function align(a: string[], b: string[]): { d: number; regions: Reg[] } {
  const m=a.length,n=b.length;
  const D: number[][] = Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=> i===0?j : j===0?i : 0));
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)D[i][j]=Math.min(D[i-1][j]+1,D[i][j-1]+1,D[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  // backtrace
  let i=m,j=n; const ops: ("=" |"s"|"d"|"i")[] = []; const ai: number[] = [];
  while(i>0||j>0){
    if(i>0&&j>0&&D[i][j]===D[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){ ops.push(a[i-1]===b[j-1]?"=":"s"); ai.push(i-1); i--;j--; }
    else if(i>0&&D[i][j]===D[i-1][j]+1){ ops.push("d"); ai.push(i-1); i--; }
    else { ops.push("i"); ai.push(i); j--; }
  }
  ops.reverse(); ai.reverse();
  const regions: Reg[] = []; let cur: Reg|null = null;
  for(let k=0;k<ops.length;k++){
    if(ops[k]==="="){ cur=null; continue; }
    if(cur===null){ cur={ai:ai[k],alen:0,blen:0}; regions.push(cur); }
    if(ops[k]==="s"){cur.alen++;cur.blen++;}
    else if(ops[k]==="d"){cur.alen++;}
    else cur.blen++;
  }
  return { d: D[m][n], regions };
}
const hist: Record<string,[number,number]> = {};
const lines: string[] = [];
for (const r of opaque) {
  const a = r.text.split(" ");
  let best: {d:number;regions:Reg[];t:string} | null = null;
  for (const b0 of built) {
    const al = align(a, b0.split(" "));
    if (best === null || al.regions.length < best.regions.length ||
        (al.regions.length === best.regions.length && al.d < best.d)) best = { ...al, t: b0 };
  }
  const k = best!.regions.length;
  const maxr = Math.max(...best!.regions.map(x=>Math.max(x.alen,x.blen)));
  const key = `R${k}`;
  const t = hist[key] ?? [0,0]; t[0]++; t[1]+=r.units; hist[key]=t;
  lines.push(`R${k} maxreg=${maxr} d=${best!.d}  :: ${r.text.slice(0,52)}  →  ${best!.t.slice(0,52)}`);
}
console.log("=== MINIMUM NUMBER OF DISJOINT EDIT REGIONS to the nearest built sentence ===");
for (const [k,v] of Object.entries(hist).sort()) console.log(`  ${k}: ${v[0]} rows / ${v[1]}p`);
console.log("\n"+lines.sort().join("\n"));
