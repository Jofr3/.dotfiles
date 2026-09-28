set -e
cd /home/jofre/projects/luminous_ui
probe() {
  file="$1"; find="$2"; repl="$3"; name="$4"
  python3 - "$file" "$find" "$repl" <<'PY'
import sys
p, f, r = sys.argv[1], sys.argv[2], sys.argv[3]
t = open(p, encoding="utf-8").read()
n = t.count(f)
assert n == 1, f"{p}: find occurs {n} times"
open(p + ".bak", "w", encoding="utf-8").write(t)
open(p, "w", encoding="utf-8").write(t.replace(f, r))
PY
  out=$(npx vitest run packages/engine/src/mutationSummaryQuote.test.ts 2>&1 | grep -E "Tests  " | head -1)
  mv "$file.bak" "$file"
  echo "$name => $out"
}
