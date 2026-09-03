# Troubleshooting hsql

Read this after a failed command or when output looks incomplete. Preserve the exit code
and stderr; do not retry with broader privileges or fewer safety controls by default.

## First collect non-connecting facts

```bash
hsql --version
hsql --info
hsql --help -a postgres
hsql --spec -a postgres
```

Replace `postgres` with the selected adapter. These reveal version, installed plug-ins,
config metadata, capabilities, and valid options without opening a database connection.
Treat output as potentially sensitive: profile names, hosts, usernames, and file paths
may appear, and old or third-party adapters may not mark secrets correctly.

## Exit-code workflow

Read the process code before trusting stdout. The commonly documented codes are:

| Code | Meaning | Next step |
| --- | --- | --- |
| `0` | success | Check truncation and display limits. |
| `1` | database rejected SQL/query failed | Inspect dialect, names, permissions, and the exact SQL. |
| `2` | usage or config error | Compare flags with local help/spec; validate profiles. |
| `3` | connection failed | Check adapter, target, network, and credential source. |
| `4` | timeout | Investigate query plan/scope before increasing a bound. |
| `130` | interrupted | Determine who cancelled it; do not treat partial output as complete. |

Versions can differ, so use `hsql --help` as the final authority.

## Code 2: flags or config

Typical causes:

- A flag exists in newer docs but not in the installed version.
- An option belongs to another adapter. Run `hsql --help -a NAME`.
- A mode such as config/catalog inspection was combined with `-c` or `-f`.
- `-P` names no profile, an environment reference is unset, or TOML is invalid.
- A single-result format was asked to emit several result sets.

Use `hsql --config validate` and, when safe, `hsql --config list-profiles`. Do not fix a
misspelled flag by silently dropping a requested read-only or timeout control.

## Code 3: connection

1. Confirm the exact profile/target with the user.
2. Check that the adapter loads in `hsql --info -a NAME`.
3. Inspect only the necessary non-secret config fields; do not paste full config output.
4. Check network/DNS/socket availability outside hsql when appropriate.
5. Retry with the smallest non-mutating query only after the issue is understood.

Never move a password into the command line merely to test a connection.

## Code 1: query

The database's SQL dialect still applies; hsql standardizes the CLI and output, not SQL.
For missing relations or columns, inspect the catalog if the installed CLI supports it,
or query the dialect's metadata tables as described in [queries.md](queries.md). Use the
exact discovered identifiers and quoting.

Permission errors may prove a read-only or least-privileged profile is working. Do not
remove that restriction unless the user explicitly authorizes the needed side effect.

## Success with surprising output

- **Exactly or fewer than 500 rows:** likely the default `--limit`; use `--stats` and
  check `"truncated"`.
- **Fetched rows not all printed:** `--display-rows` affects text layouts without changing
  fetched data.
- **No stdout:** check `-o`, `--format none`, the selected `--result`, and whether the
  query naturally returns rows.
- **Unexpected NULL rendering:** inspect `--null-string` and format defaults.
- **Multiple result sets rejected:** use `--result last|N` or a supported multi-result
  layout such as JSONL.

Do not use `--limit -1` reflexively. First narrow or aggregate the query, estimate result
size, and choose a suitable output destination.

## Version drift

The current website may document a newer hsql than the installed binary. In particular,
catalog flags, global safety controls, aliases, output-directory behavior, and `--skill`
have changed across releases. Trust the local `--spec` and adapter help. If a required
safety feature is unavailable, stop and explain the limitation rather than emulating it
unsafely or upgrading without permission.

Documentation: <https://harlequin.sh/docs/hsql>
Issues: <https://github.com/tconbeer/harlequin/issues>
