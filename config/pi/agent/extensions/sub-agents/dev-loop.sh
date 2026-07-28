#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${PI_LOOP_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
EXT="$ROOT/agent/extensions/sub-agents"

MAX_SLICES="${PI_LOOP_MAX_SLICES:-3}"
AUTO="${PI_LOOP_AUTO:-0}"
SAVE_SESSIONS="${PI_LOOP_SAVE_SESSIONS:-1}"
THINKING="${PI_LOOP_THINKING:-high}"
PI_BIN="${PI_BIN:-$(command -v pi)}"

cd "$ROOT"

for file in BACKLOG.md SPEC.md WORKTREES.md README.md; do
  [[ -f "$EXT/$file" ]] || {
    echo "Missing required context: $EXT/$file" >&2
    exit 1
  }
done

tmp=""
cleanup() {
  [[ -z "$tmp" ]] || rm -f "$tmp"
}
trap cleanup EXIT INT TERM

for ((slice = 1; slice <= MAX_SLICES; slice++)); do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"

  args=(
    --print
    --approve
    --no-extensions
    --no-skills
    --no-prompt-templates
    --no-themes
    --tools read,bash,edit,write,grep,find,ls
    --thinking "$THINKING"
  )

  if [[ -n "${PI_LOOP_MODEL:-}" ]]; then
    args+=(--model "$PI_LOOP_MODEL")
  fi

  # Every invocation is fresh because neither --continue nor --session is used.
  if [[ "$SAVE_SESSIONS" == "1" ]]; then
    args+=(--name "sub-agents slice ${stamp}-${slice}")
  else
    args+=(--no-session)
  fi

  prompt="$(cat <<EOF
Implement exactly one bounded development slice of the sub-agents extension.

Slice number: $slice

Startup requirements:
1. Treat the attached BACKLOG.md, SPEC.md, WORKTREES.md, and README.md
   plus the automatically loaded CLAUDE.md as authoritative.
2. Follow BACKLOG.md's resume protocol.
3. Inspect git status without reading sensitive files.
4. Select the first unblocked NEXT item, then READY.
5. Preserve unrelated working-tree changes.
6. Never inspect agent/auth.json, agent/sessions/**, credential files,
   resolver bindings, .env files, or real authentication data.

Slice rules:
- Complete one coherent, independently verifiable acceptance-criterion-sized
  change, not an entire broad milestone unless it is genuinely small.
- Prefer a focused failing test followed by the minimum implementation.
- Use only fake clients/models and disposable local fixtures.
- Do not contact providers, networks, databases, 1Password, MCP, or other
  external services.
- Do not install or update dependencies.
- Do not create worktrees, branches, merges, or cleanup operations in the
  real source repository. Use only the existing disposable offline harness.
- Do not autonomously approve a user/release gate.

Before finishing:
1. Run the focused validation for this slice.
2. Run node agent/extensions/sub-agents/test/run-offline.mjs before marking
   a backlog item DONE, or whenever the change has broad integration impact.
3. Update BACKLOG.md with status, files changed, validation results,
   unresolved issues, and the exact next recommended slice.
4. Append the required handoff entry.
5. Keep exactly one recommended next item when possible.

End your final response with exactly these three unformatted lines:
PI_LOOP_STATUS: CONTINUE|REVIEW|BLOCKED|NO_WORK
PI_LOOP_ITEM: <backlog item ID or NONE>
PI_LOOP_SUMMARY: <one-line summary>

Use CONTINUE when another autonomous implementation slice is available.
Use REVIEW when an informed human decision or approval is required.
Use BLOCKED for another external blocker.
Use NO_WORK when no planned implementation work remains.
EOF
)"

  tmp="$(mktemp)"

  echo
  echo "=== sub-agents development slice $slice/$MAX_SLICES ==="

  if ! "$PI_BIN" "${args[@]}" \
    "@agent/extensions/sub-agents/BACKLOG.md" \
    "@agent/extensions/sub-agents/SPEC.md" \
    "@agent/extensions/sub-agents/WORKTREES.md" \
    "@agent/extensions/sub-agents/README.md" \
    "$prompt" | tee "$tmp"
  then
    echo "Pi failed during slice $slice; stopping." >&2
    exit 1
  fi

  status="$(
    sed -n 's/^PI_LOOP_STATUS:[[:space:]]*//p' "$tmp" | tail -n 1
  )"

  rm -f "$tmp"
  tmp=""

  echo
  git diff --stat -- "$EXT" || true

  case "$status" in
    CONTINUE)
      if [[ "$AUTO" != "1" ]]; then
        reply=""
        if ! read -r -p "Review changes and run the next fresh slice? [y/N] " reply; then
          break
        fi
        [[ "$reply" =~ ^[Yy]$ ]] || break
      fi
      ;;
    REVIEW|BLOCKED|NO_WORK)
      echo "Loop stopped with status: $status"
      exit 0
      ;;
    *)
      echo "Missing or invalid PI_LOOP_STATUS; stopping fail-closed." >&2
      exit 1
      ;;
  esac
done

echo "Reached the configured slice limit: $MAX_SLICES"
