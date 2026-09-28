set -u
cd /home/jofre/projects/luminous_ui
for S in packages/engine/src/extraEnergyBonus.test.ts packages/engine/src/selfEnergyToHand.test.ts packages/engine/src/familialMarch.test.ts packages/engine/src/damageSuppression.test.ts packages/engine/src/ownBenchSnipe.test.ts; do
  echo "############ SUITE $S ############"
  for C in R1-every R2-undefined R3-loose; do bun "$CLAUDE_JOB_DIR/tmp/d498-probe.ts" "$C" "$S"; done
done
echo "###DONE###"
