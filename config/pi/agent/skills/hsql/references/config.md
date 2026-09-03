# Config files, profiles, and credentials

Read this when selecting, creating, or troubleshooting a Harlequin profile.

## Inspect without connecting

```bash
hsql --info
hsql --config list-profiles
hsql --config validate
hsql --config schema
```

`hsql --info` is the authority for the config files and profile the installed version
found. `--config` modes do not execute SQL, but their output can reveal hosts, usernames,
file paths, profile names, and possibly secrets on older or third-party adapters. Inspect
only what is needed and do not paste complete output into a reply or log.

`hsql --config show` displays merged values and their sources. Treat it as sensitive even
when the installed version claims to mask adapter-declared secrets.

## Prefer profiles for remote databases

A typical `harlequin.toml` profile is:

```toml
default_profile = "dev"

[profiles.dev]
adapter = "postgres"
host = "${PGHOST:-localhost}"
port = 5432
dbname = "app"
user = "${PGUSER}"
password = "${PGPASSWORD}"
```

Keep secret values in environment variables, a driver-supported credential file, or a
secret manager. Never put them directly in committed TOML or a connection string passed
on the command line. Do not print the resolved values.

Profile keys generally use long option names with dashes changed to underscores, but the
installed config schema is the source of truth:

```bash
hsql --config schema -o ./harlequin-schema.json
hsql --help -a postgres
```

Only add `read_only`, `timeout`, SSH, or adapter-specific keys when the installed schema
and adapter help define them with the required semantics.

Select a profile with `-P NAME`. `-P None` requests Harlequin defaults without selecting
a configured profile on versions that support it. A local DuckDB or SQLite file may be
passed positionally because its path is not a credential.

## Discover and validate

1. Run `hsql --info` to identify version, installed adapters, and config locations.
2. Run `hsql --help -a NAME` or `hsql --spec -a NAME` for connection option names.
3. Run `hsql --config schema` when editing TOML.
4. Put secrets behind environment-variable references.
5. Run `hsql --config validate`.
6. With the target confirmed, make the smallest read-only connection/query that proves
   the profile works.

Do not assume a default profile points at development. Ask before connecting when the
profile or environment is ambiguous.

## Config writes

`hsql --config init` writes a profile in versions that support it. It is a filesystem
mutation and may persist sensitive settings. Use it only when the user explicitly asks
to create or modify a profile; first inspect local help/schema, state which file and
profile will change, keep secrets as environment references, and validate afterward.

When editing config by hand, preserve unrelated profiles and comments. `hsql` and the
Harlequin IDE share profiles, so a profile created for the CLI may affect interactive
usage too.

## Hand off to the IDE

For interactive connection setup or schema exploration, use the same profile:

```bash
harlequin -P dev
```

Do not launch an interactive IDE in an unattended script.
