#!/bin/sh
# Runs one command button's command in its terminal, records how it ended as the
# terminal's label (cmdbtn.exit) for the bar, then keeps the output on screen.
cmd="$1"
printf '\033[2m$ %s\033[0m\n' "$cmd"
"${SHELL:-/bin/sh}" -lc "$cmd"
ec=$?
hc label "$HC_TERMINAL_ID" "cmdbtn.exit=$ec" >/dev/null 2>&1
if [ "$ec" -eq 0 ]; then printf '\n\033[34m✓ done\033[0m'; else printf '\n\033[31m✗ exited with %s\033[0m' "$ec"; fi
printf '\033[2m · Enter closes\033[0m'
read -r _
exit "$ec"
