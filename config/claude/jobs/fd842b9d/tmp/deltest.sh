set -e
cd /home/jofre/projects/luminous_ui
cp packages/engine/src/attack.ts /home/jofre/.claude/jobs/fd842b9d/tmp/attack.ts.bak
python3 - <<'PY'
p='packages/engine/src/attack.ts'
s=open(p).read()
i=s.index('    case "specialConditionsOnOpponentActive": {')
j=s.index('    case "damageCountersOnYourBench": {', i)
open('/home/jofre/.claude/jobs/fd842b9d/tmp/removed_arm.txt','w').write(s[i:j])
open(p,'w').write(s[:i]+s[j:])
print("arm removed,", j-i, "bytes")
PY
echo "--- tsc -b --force ---"
bunx tsc -b --force 2>&1 | head -30 || true
echo "--- restoring ---"
cp /home/jofre/.claude/jobs/fd842b9d/tmp/attack.ts.bak packages/engine/src/attack.ts
echo "restored; diff vs git:"
git diff --stat packages/engine/src/attack.ts
