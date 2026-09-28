set -u
P=/home/jofre/projects/luminous_ui/scripts/opaque-anatomy.ts
cd /home/jofre/projects/luminous_ui
SHA0=$(sha256sum "$P" | cut -d' ' -f1); SZ0=$(stat -c%s "$P")
echo "BEFORE size=$SZ0 sha=$SHA0"
cp "$P" "$CLAUDE_JOB_DIR/tmp/anat.orig.ts"
trap 'cp "$CLAUDE_JOB_DIR/tmp/anat.orig.ts" "$P"; echo "RESTORED size=$(stat -c%s "$P") sha=$(sha256sum "$P"|cut -d" " -f1)"' EXIT
python3 - <<'PY'
import io
p="/home/jofre/projects/luminous_ui/scripts/opaque-anatomy.ts"
s=io.open(p,encoding="utf8").read()
f='    if (best === null || regions.length < best.k) best = { k: regions.length, onto, regions };'
r='    if (best === null) best = { k: regions.length, onto, regions };'
parts=s.split(f)
assert len(parts)==2, len(parts)          # find occurs exactly once
out=r.join(parts)                          # split/join: no directive interpretation at all
assert len(s)-len(out) == len(f)-len(r) > 0, (len(s), len(out))
io.open(p,"w",encoding="utf8").write(out)  # encode-first is implicit: text mode, one write
print("mutated: %d -> %d bytes (delta %d)" % (len(s), len(out), len(s)-len(out)))
PY
echo "MUTATED sha=$(sha256sum "$P"|cut -d' ' -f1)"
echo "--- 1. opaque-anatomy-gate (the new killer) ---"; bun scripts/opaque-anatomy-gate.ts >/dev/null 2>&1; echo "   exit=$?"
echo "--- 2. residue-census-gate (D465's gate) ---";     bun scripts/residue-census-gate.ts >/dev/null 2>&1; echo "   exit=$?"
echo "--- 3. residue-census (the instrument anatomised) ---"; bun scripts/residue-census.ts >/dev/null 2>&1; echo "   exit=$?"
echo "--- 4. mutation precheck ---";                     bun scripts/mutation/precheck.ts >/dev/null 2>&1; echo "   exit=$?"
echo "--- 5. lint-coverage / biome ---";                 bun scripts/lint-coverage.ts >/dev/null 2>&1; echo "   lint-coverage exit=$?"
bunx biome lint scripts/opaque-anatomy.ts --error-on-warnings >/dev/null 2>&1; echo "   biome exit=$?"
echo "--- 6. bun run check ---"; bun run check >"$CLAUDE_JOB_DIR/tmp/check-attrib2.log" 2>&1; echo "   exit=$?"
grep -E '^ *(Test Files|Tests) ' "$CLAUDE_JOB_DIR/tmp/check-attrib2.log"
