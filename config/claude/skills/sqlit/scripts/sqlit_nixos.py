#!/usr/bin/env python3
"""Run sqlit with existing, architecture-compatible NixOS SQL Server libraries."""

import glob
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys


LIBRARIES = {
    "libstdc++.so.6": "/nix/store/*-gcc-*-lib/lib/libstdc++.so.6",
    "libkrb5.so.3": "/nix/store/*-krb5-*-lib/lib/libkrb5.so.3",
    "libgssapi_krb5.so.2": "/nix/store/*-krb5-*-lib/lib/libgssapi_krb5.so.2",
    "libltdl.so.7": "/nix/store/*-libtool-*-lib/lib/libltdl.so.7",
    "libssl.so.3": "/nix/store/*-openssl-*/lib/libssl.so.3",
}


def elf_arch(path):
    try:
        with Path(path).open("rb") as stream:
            header = stream.read(20)
    except OSError:
        return None
    if len(header) != 20 or header[:4] != b"\x7fELF":
        return None
    return header[4:6], header[18:20]


def prepare_runtime(executable, environment):
    if platform.freedesktop_os_release().get("ID") != "nixos":
        raise RuntimeError("This helper is for NixOS SQL Server; use sqlit directly here.")
    architecture = elf_arch("/proc/self/exe")
    if architecture is None:
        raise RuntimeError("Cannot determine the running process's ELF architecture.")

    env = environment.copy()
    directories = []
    for value in (env.get("LD_LIBRARY_PATH", ""),
                  env.get("NIX_LD_LIBRARY_PATH", ""),
                  "/run/current-system/sw/share/nix-ld/lib"):
        for directory in value.split(":"):
            if directory and directory not in directories:
                directories.append(directory)
    for library, pattern in LIBRARIES.items():
        if any(elf_arch(Path(directory) / library) == architecture
               for directory in directories):
            continue
        match = next((path for path in sorted(glob.glob(pattern))
                      if elf_arch(path) == architecture), None)
        if match is None:
            raise RuntimeError(f"No compatible installed library found: {library}")
        directory = str(Path(match).parent)
        if directory not in directories:
            directories.append(directory)
    env["LD_LIBRARY_PATH"] = ":".join(directories)

    # Inspect the dynamically loaded driver, not just the Python extension.
    prefix = Path(executable).resolve().parent.parent
    drivers = [path for path in prefix.glob(
        "lib/python*/site-packages/mssql_python_odbc/libs/linux/"
        "debian_ubuntu/*/lib/libmsodbcsql-18*.so*"
    ) if elf_arch(path) == architecture]
    if len(drivers) != 1:
        raise RuntimeError("Cannot uniquely locate the bundled ODBC 18 driver in sqlit's runtime.")
    check = subprocess.run(["ldd", str(drivers[0])], env=env,
                           capture_output=True, text=True, timeout=15)
    diagnostics = check.stdout + check.stderr
    if check.returncode or "not found" in diagnostics:
        raise RuntimeError("ODBC runtime dependencies unresolved:\n" + diagnostics.strip())
    return env


def main(args):
    if not args:
        print("Usage: sqlit_nixos.py --check-runtime | <sqlit arguments>", file=sys.stderr)
        return 2
    executable = shutil.which("sqlit")
    if executable is None:
        print("sqlit is not installed or not on PATH", file=sys.stderr)
        return 1
    try:
        env = prepare_runtime(executable, os.environ)
        if args == ["--check-runtime"]:
            print("NixOS SQL Server runtime dependencies resolved; no database connection attempted.")
            return 0
        # Execute once; query retries and credentials remain the caller's responsibility.
        os.execvpe(executable, [executable, *args], env)
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
