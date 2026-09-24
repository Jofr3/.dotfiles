# SQL Server runtime on NixOS

Use this reference only for SQL Server through sqlit on NixOS. Verified with
sqlit 1.6.4 and its `mssql_python` / `mssql_python_odbc` runtime in the local uv
tool installation. The CLI reported `DDBC Error: Failed to load the driver`
before contacting SQL Server; this was not an authentication failure.

The successful fix was to supply existing libraries through the **child
process's `LD_LIBRARY_PATH`**. `NIX_LD_LIBRARY_PATH` alone did not make them
visible to this runtime. Required libraries included `libstdc++.so.6`,
`libkrb5.so.3`, `libgssapi_krb5.so.2`, and `libltdl.so.7`; expose OpenSSL for
the driver's runtime loading as well. The driver and companion ODBC package
were already installed, so reinstalling them was unnecessary.

Use [../scripts/sqlit_nixos.py](../scripts/sqlit_nixos.py) instead of rebuilding
this workaround. It finds libraries in the existing environment and Nix store,
checks ELF class, byte order, and machine against the running process, checks
the bundled driver with `ldd`, then invokes the real `sqlit` CLI once. It does
not connect using a Python driver, install dependencies, or persist settings.

From the process that creates the temporary profile, replace the CLI invocation
with this argument list, where `skill_root` is this skill's directory
(`${CLAUDE_SKILL_DIR}` in SKILL.md, typically `~/.claude/skills/sqlit`):

```python
result = subprocess.run(
    [sys.executable, str(skill_root / "scripts/sqlit_nixos.py"),
     "query", "-c", name,
     "-q", "SELECT 1 AS ok, DB_NAME() AS database_name",
     "--format", "json", "--limit", "1"],
    env=env, stdin=subprocess.DEVNULL, check=False, timeout=45,
)
```

The existing temporary-profile environment and password command remain in use.
Keep credentials out of CLI arguments and redact captured errors as usual.
For a local diagnostic with no database access:

```bash
python3 ~/.claude/skills/sqlit/scripts/sqlit_nixos.py --check-runtime
```

Do not save `/nix/store/<hash>-...` paths in the skill or application settings:
they change across rebuilds and garbage collection. Do not choose the first
glob match without inspecting its ELF architecture: this machine's store
contains libraries for multiple architectures. Checking only `ldd` on the
Python extension misses dependencies of the dynamically loaded ODBC driver.

The helper covers the verified uv/virtualenv layout and bundled Microsoft ODBC
18 driver. If discovery or dependency checks fail, report the precise local
blocker and inspect that runtime's layout or unresolved libraries. If the query
reaches SQL Server and produces a network or authentication error, diagnose that
new error instead of repeating library setup. Keep any further changes scoped
to the task; this workaround does not require global NixOS changes.
