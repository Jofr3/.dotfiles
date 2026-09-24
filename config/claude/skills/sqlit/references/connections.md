# Connection translation and headless profiles

Use the installed CLI's help as the authority for flags. These details and the
temporary profile format were verified against sqlit 1.6.4. The
[upstream project](https://github.com/Maxteabag/sqlit) documents the CLI; inspect
the installed implementation if a later version changes the config format.

## Normalize the selected record

Read the selected record from `os.environ["DATABASES"]` inside Python rather
than interpolating a DSN into shell code. Keep parsing failures redacted:
library exceptions can include the original connection string. Map `sqlserver`
and `mssql` to `mssql`, and `postgres` and `postgresql` to `postgresql`.

| Provider | Source format and translation |
| --- | --- |
| MySQL | Existing records use Go DSNs: `user:password@tcp(host:port)/database?options`. Split from the right at `@tcp(` and then at `)/`; split the credentials at the first `:`. The password is literal Go-DSN text, so do not URL-decode it. Parse the address, database, and query options separately. Support a standard `mysql://...` URL when that is the actual source format. |
| SQL Server | Existing records use `sqlserver://user:password@host:port?database=NAME&encrypt=...`. URL-decode user/password and read the database from the `database` query parameter when present, or from the path otherwise. Do not rely on sqlit's URL parser to turn a `database` query parameter into the selected database. Use provider `mssql` and the source authentication method (usually `auth_type: sql` for username/password). |
| PostgreSQL | Parse `postgres://...` or `postgresql://user:password@host:port/database?sslmode=...` with `urllib.parse`. URL-decode the credentials and database path. Preserve TLS mode, certificates, and other required connection options. |
| D1 | Use the Cloudflare account ID as `host`/`--server`, the API token as `password`, and the actual database **name** as `database`/`--database`. sqlit resolves the name to a UUID using the account's D1 API. A Wrangler binding name or database UUID is not a substitute for the database name in this version. Read `account_id` and the matching `d1_databases` entry from project configuration; obtain the token from the credential record, referenced environment, or user. |

Default TCP ports are MySQL 3306, SQL Server 1433, and PostgreSQL 5432. Preserve
an explicit port. D1 uses Cloudflare's API, so do not invent a SQL server port
or username. A Wrangler local development database is distinct from remote D1;
establish which target the task requests.

Do not assume query parameters have the same names or semantics as sqlit
options. Its TLS flags include `--tls-mode` and provider-specific certificate
flags; the corresponding config keys use underscores. For example,
PostgreSQL `sslmode=verify-full` maps to `tls_mode: verify-full`. Resolve SQL
Server `encrypt`/certificate-trust settings and MySQL named TLS configurations
against the selected adapter rather than ignoring them or weakening TLS to
make a connection succeed. If a record uses an unfamiliar DSN format, inspect
the application's driver configuration instead of guessing.

Verified with sqlit 1.6.4: a SQL Server source value `encrypt=disable` maps to
`options: {"auth_type": "sql", "tls_mode": "disable"}` for SQL authentication.
Apply this only when the source explicitly disables encryption; it is not a
workaround for driver loading or TLS errors.

## Task-only connections without persisted secrets

`sqlit query` needs a named profile even for a one-off command. Set a private
temporary `SQLIT_CONFIG_DIR` for both profile setup and querying. This also
keeps task query history temporary. `--settings` alone does not select a
different connections directory.

Use a password command that reads an inherited environment variable; do not
embed the password in the command. The following Python pattern takes already
normalized connection fields in memory, writes only nonsecret profile fields,
and removes its temporary config when the command finishes. It uses sqlit's
CLI for execution and does not install or directly invoke database drivers.

```python
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import uuid


def run_query(connection, query_args):
    # connection contains db_type, host, database, optional port/username,
    # password, and provider-specific options. No credential-bearing URL.
    with tempfile.TemporaryDirectory(prefix="sqlit-task-") as directory:
        name = "task-" + uuid.uuid4().hex
        env = os.environ.copy()
        env["SQLIT_CONFIG_DIR"] = directory
        env.pop("SQLIT_SETTINGS_PATH", None)
        env["SQLIT_SKIP_KEYRING_PROBE"] = "1"
        endpoint = {
            "kind": "tcp",
            "host": connection["host"],
            "port": str(connection.get("port", "")),
            "database": connection["database"],
            "username": connection.get("username", ""),
            "password": None,
        }
        password = connection.get("password")
        if password is not None:
            env["SQLIT_TASK_PASSWORD"] = password
            endpoint["password_command"] = shlex.join([
                sys.executable, "-c",
                'import os; print(os.environ["SQLIT_TASK_PASSWORD"], end="")',
            ])
        profile = {
            "name": name,
            "db_type": connection["db_type"],
            "endpoint": endpoint,
            "options": connection.get("options", {}),
        }
        path = Path(directory) / "connections.json"
        path.write_text(json.dumps([profile]), encoding="utf-8")
        path.chmod(0o600)
        result = subprocess.run(
            ["sqlit", "query", "-c", name, *query_args],
            env=env, stdin=subprocess.DEVNULL, check=False,
        )
        return result.returncode
```

Call this in the process that parsed the selected credential, for example
`run_query(connection, ["-q", "SELECT 1 AS ok", "--format", "json", "--limit", "10"])`.
Propagate its return code with `raise SystemExit(...)`. Keep required TLS/auth
settings in `connection["options"]`; SQL Server SQL authentication uses
`{"auth_type": "sql"}` alongside its TLS settings. Extend the profile using the
installed schema when an actual connection requires SSH or another feature.
For NixOS SQL Server, replace the `"sqlit"` executable in the subprocess argument
list with `sys.executable, str(skill_root / "scripts/sqlit_nixos.py")`
(`skill_root` is this skill's directory, `${CLAUDE_SKILL_DIR}` in SKILL.md), retaining
the same arguments and environment; see [nixos.md](nixos.md). For connection-only
tests, add a subprocess timeout (for example 45 seconds); a timeout does not
establish whether credentials are valid. Do not apply this probe timeout to
arbitrary queries or retry writes automatically.
The password-command interface strips leading and trailing whitespace. If a
password depends on those characters, use a supported credential mechanism
that preserves them instead of this pattern.

The D1 provider's 1.6.4 CLI parser marks `--password` required, even when using
`--password-stdin` or `--password-command`. The temporary profile pattern above
avoids that parser limitation without exposing a token in process arguments.

## Existing or intentionally saved connections

`sqlit connections list` shows saved names. Match the endpoint and environment
before reusing one. Project mode uses `sqlit /path/to/project query ...` and
stores config under the project's `.sqlit/`; choose it only when that project
configuration is intended. Do not combine a project path with the temporary
config pattern, because project mode changes the config directory.

For requested persistent connection setup, use `sqlit connections add PROVIDER`
with the provider's supported flags. Prefer `--password-command` referencing
the actual credential source, or `--password-stdin` when persistence is intended
and the keyring is available. Successful profile creation alone does not prove
the password was saved: sqlit may discard it when no usable credential store
exists. Do not enable plaintext credential storage to work around this for an
ordinary query task; use the temporary profile instead.
