set -u
P=/home/jofre/projects/luminous_ui/scripts/opaque-anatomy.ts
cd /home/jofre/projects/luminous_ui
SHA0=$(sha256sum "$P" | cut -d' ' -f1); SZ0=$(stat -c%s "$P")
echo "BEFORE size=$SZ0 sha=$SHA0"
cp "$P" "$CLAUDE_JOB_DIR/tmp/anat.orig.ts"
python3 - <<'PY'
import io
p="/home/jofre/projects/luminous_ui/scripts/opaque-anatomy.ts"
s=io.open(p,encoding="utf8").read()
f='    if (best === null || regions.length < best.k) best = { k: regions.length, onto, regions };'
r='    if (best === null) best = { k: regions.length, onto, regions };'
assert s.count(f)==1
out=s.replace(f, lambda m: r, 1)
assert len(out) < len(s) and len(s)-len(out) < 200, (len(s), len(out))
io.open(p,"w",encoding="utf8").write(out)
print("mutated", len(s), "->", len(out))
PY
trap 'cp "$CLAUDE_JOB_DIR/tmp/anat.orig.ts" "$P"; echo "RESTORED size=$(stat -c%s "$P") sha=$(sha256sum "$P"|cut -d" " -f1)"' EXIT
echo "--- 1. opaque-anatomy-gate (the new killer) ---"
bun scripts/opaque-anatomy-gate.ts >/dev/null 2>&1; echo "   exit=$?"
echo "--- 2. residue-census-gate (D465's gate) ---"
bun scripts/residue-census-gate.ts >/dev/null 2>&1; echo "   exit=$?"
echo "--- 3. residue-census (the instrument it anatomises) ---"
bun scripts/residue-census.ts >/dev/null 2>&1; echo "   exit=$?"
echo "--- 4. mutation precheck ---"
bun scripts/mutation/precheck.ts >/dev/null 2>&1; echo "   exit=$?"
echo "--- 5. lint-coverage + biome ---"
bun scripts/lint-coverage.ts >/dev/null 2>&1; echo "   lint-coverage exit=$?"
bunx biome lint scripts/opaque-anatomy.ts --error-on-warnings >/dev/null 2>&1; echo "   biome exit=$?"
echo "--- 6. bun run check (tsc + lint + 459 suites) ---"
bun run check >"$CLAUDE_JOB_DIR/tmp/check-attrib.log" 2>&1; echo "   exit=$?"
tail -4 "$CLAUDE_JOB_DIR/tmp/check-attrib.log" | head -3
