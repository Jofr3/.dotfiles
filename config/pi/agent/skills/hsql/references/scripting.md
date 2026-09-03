# hsql in scripts and pipelines

Read this when hsql output will be consumed by a shell script, Makefile, CI job, or
another program.

## Safe baseline

```bash
#!/usr/bin/env bash
set -euo pipefail

row_count=$(hsql -P reporting --on-error stop -tAc \
  "select count(*) from orders")
printf '%s\n' "$row_count"
```

Use a named least-privileged profile, not a credential-bearing connection string. Add
`--read-only` only if `hsql --help -a NAME` confirms that the selected adapter implements
the required behavior. Older hsql versions may expose it only for some adapters.

For any SQL file, inspect the entire file before execution. Initialization scripts,
extension options, procedures, `COPY`, `ATTACH`, and apparently read-only functions can
have side effects.

## Preserve errors and warnings

Use `set -euo pipefail` so non-zero hsql exits fail a pipeline. Never use `2>/dev/null`:
hsql places errors, warnings, truncation notices, and `--stats` on stderr while stdout is
reserved for result data. If stderr is redirected to a log, ensure the script checks the
exit status and the log.

The common exit codes are:

- `0` success
- `1` SQL/query error
- `2` usage or config error
- `3` connection error
- `4` timeout, when supported
- `130` interrupted

Verify them with the installed `hsql --help` before encoding long-lived automation.

## Machine-readable output

```bash
hsql -P reporting --limit -1 --csv -c "select * from users" | your-loader
hsql -P reporting --limit -1 --jsonl -c "select * from events" | jq -r '.id'
hsql -P reporting --limit -1 --format parquet \
  -o ./out/users.parquet -c "select * from users"
```

Use `-tAc` for a scalar instead of parsing the table layout. Prefer `jsonl` for streaming
or multiple result sets. Single-result formats such as CSV, JSON, or Parquet may require
`--result last|N`; check local help and fail rather than concatenating ambiguous output.
Use an explicit output file unless directory output is confirmed by the installed
version.

`--limit -1` is appropriate only when complete data is required and the expected size
and destination have been checked. Otherwise keep a finite limit and aggregate/filter in
SQL.

## Check completeness

`--stats` emits one JSON summary line on stderr. When result data is written with `-o`,
stderr can be checked separately:

```bash
stats_file=$(mktemp)
trap 'rm -f "$stats_file"' EXIT

if ! hsql -P reporting --limit -1 --stats --csv -o ./data.csv \
    -c "select * from orders" 2>"$stats_file"; then
  cat "$stats_file" >&2
  exit 1
fi

cat "$stats_file" >&2
jq -e 'select(.truncated == false)' <"$stats_file" >/dev/null
```

If the selected version writes notes as well as stats to stderr, parse only the JSON line
rather than assuming stderr contains JSON exclusively.

## Multiple statements

```bash
hsql -P reporting --on-error stop --result last --markdown \
  -f ./setup.sql \
  -c "select count(*) from modeled_table"
```

Inputs run in the order provided on one connection. `--result` controls emitted results,
not execution. Do not assume hsql wraps all inputs in one transaction; write explicit
`BEGIN`/`COMMIT` only when correct for the target dialect and authorized side effects.

## Secrets and untrusted values

Do not expose credentials through arguments, environment dumps, debug tracing (`set -x`),
logs, or artifacts. hsql has no universal bind-parameter option, so never splice
untrusted strings or identifiers into `-c`. Generate SQL only from trusted constants, or
use a dialect/driver path that supports bound parameters.

Any script that writes data requires explicit authorization for its exact target and
scope. Use a database role whose privileges enforce that scope.
