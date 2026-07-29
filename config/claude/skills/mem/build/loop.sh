#!/usr/bin/env bash
# Thin wrapper. The driver is loop.mjs — failure triage needs JSON parsing and time math.
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/loop.mjs" "$@"
