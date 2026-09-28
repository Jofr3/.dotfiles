import { MUTANTS } from "/home/jofre/projects/luminous_ui/scripts/mutation/mutants";
const ids = ["D448-fold-ignores-the-rider","D448-fold-counts-the-defenders-energy","D448-caption-quotes-the-unfolded-amount","D455-a-forced-payment-still-asks","D455-hand-cost-collapses-every-copy-to-one","D455-hand-cost-offers-the-opponents-hand","D455-hand-cost-counts-the-card-being-played","D437-narrows-after-the-arity-doctrine","D455-hand-cost-announces-a-payment-of-nothing","D420-cost-arm-drops-its-energy-filter"];
for (const id of ids) {
  const m = MUTANTS.find((x: any) => x.id === id) as any;
  if (!m) { console.log("MISSING", id); continue; }
  console.log(`\n##### ${id}  file=${m.file}`);
  console.log("FIND:", JSON.stringify(m.find));
  console.log("REPL:", JSON.stringify(m.replace));
}
