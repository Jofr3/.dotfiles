#!/usr/bin/env bash
# Run the test suite as a completion gate.
#
# `node --test 'glob'` exits 0 when the glob matches NO files. Used bare as a verify
# command that makes the gate silently vacuous: rename or empty build/tests and every
# remaining slice "passes" without running anything. So assert a non-zero pass count,
# not just a zero exit.

set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" || exit 1

out=$(node --test 'build/tests/**/*.test.mjs' 2>&1); rc=$?
echo "$out" | tail -12

pass=$(printf '%s\n' "$out" | sed -n 's/^# pass //p' | tail -1)
fail=$(printf '%s\n' "$out" | sed -n 's/^# fail //p' | tail -1)

if [[ $rc -ne 0 ]]; then
  echo "verify: node --test exited $rc" >&2; exit 1
fi
if [[ -z "${pass:-}" || "$pass" -lt 1 ]]; then
  echo "verify: NO TESTS RAN — the gate would have passed silently" >&2; exit 1
fi
if [[ "${fail:-1}" -ne 0 ]]; then
  echo "verify: $fail failing" >&2; exit 1
fi

echo "verify: $pass tests passed"
