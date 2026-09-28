set -u
cd /home/jofre/projects/luminous_ui
for S in packages/engine/src/censusAtHead.test.ts packages/engine/src/coinThreshold.test.ts packages/engine/src/discardHandDraw.test.ts; do
  echo "############ SUITE $S ############"
  bun "$CLAUDE_JOB_DIR/tmp/d498-probe.ts" all "$S"
done
echo "###DONE###"
