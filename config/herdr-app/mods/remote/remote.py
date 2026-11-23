#!/usr/bin/env python3
"""Talks to a project's server as configured in its .vscode/sftp.json (VS Code SFTP format).

  remote.py info  <sftp.json>                  profiles, without secrets
  remote.py list  <sftp.json> <profile> <path>  a remote folder as JSON entries
  remote.py get   <sftp.json> <profile> <path>  the first 400 KB of a remote file
  remote.py shell <sftp.json> <profile>         argv for an interactive sftp session
  remote.py upload <sftp.json> <profile> <local file>
                                                the local file (absolute path, inside the
                                                project) to the same place on the server;
                                                refuses files the config's "ignore" lists
  remote.py download <sftp.json> <profile> <path> [force]
                                                the remote file over the local copy (the
                                                project folder, or its "context"); refuses
                                                to replace uncommitted local work unless force

Paths are relative to the profile's remotePath. Every command prints one JSON value;
errors are {"error": ...}.

SFTP goes through OpenSSH: one background connection per server (ssh -fN, ControlPersist),
which every later request (and the interactive session) reuses, so only the first request
logs in. Passwords reach ssh through this script as its askpass program (it reads the
config again), never through a command line or the environment. FTP goes through curl,
with secrets on its stdin (-K -).
"""
import fnmatch, json, os, re, subprocess, sys
from urllib.parse import quote

PREVIEW = 400_000
MAX_ENTRIES = 1000
CURL_ERRORS = {
    6: "Could not resolve the host",
    7: "Could not connect to the server",
    9: "Access denied to this folder",
    28: "The server did not answer in time",
    60: "Unknown host key: connect once with ssh/sftp in a terminal to trust it",
    67: "Login failed: check username, password or key",
    78: "No such file or folder on the server",
    79: "The server refused this request",
}


def out(value, code=0):
    print(json.dumps(value))
    sys.exit(code)


def jsonc(text):
    """Strips // and /* */ comments and trailing commas outside strings."""
    res, i, n, in_str = [], 0, len(text), False
    while i < n:
        c = text[i]
        if in_str:
            res.append(c)
            if c == "\\" and i + 1 < n:
                res.append(text[i + 1]); i += 1
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True; res.append(c)
        elif text.startswith("//", i):
            while i < n and text[i] != "\n": i += 1
            continue
        elif text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = n if end < 0 else end + 2
            continue
        else:
            res.append(c)
        i += 1
    return json.loads(re.sub(r",(\s*[}\]])", r"\1", "".join(res)))


def profiles(path):
    try:
        with open(path, encoding="utf-8") as f:
            data = jsonc(f.read())
    except FileNotFoundError:
        out({"error": "No sftp.json"}, 1)
    except (ValueError, OSError) as e:
        out({"error": f"sftp.json is not valid JSON: {e}"}, 1)
    items = data if isinstance(data, list) else [data]
    result = []
    for item in items:
        if not isinstance(item, dict): continue
        # The extension's "profiles" are overrides on top of the base config.
        named = item.get("profiles")
        if isinstance(named, dict) and named:
            base = {k: v for k, v in item.items() if k not in ("profiles", "defaultProfile")}
            for pname, over in named.items():
                result.append({**base, **(over if isinstance(over, dict) else {}), "name": f"{item.get('name') or 'server'} · {pname}"})
        else:
            result.append(item)
    if not result:
        out({"error": "sftp.json has no server"}, 1)
    return result


def pick(path, index):
    items = profiles(path)
    try:
        return items[int(index)]
    except (ValueError, IndexError):
        out({"error": "No such server in sftp.json"}, 1)


def protocol(p):
    proto = (p.get("protocol") or "sftp").lower()
    if proto == "ftp" and p.get("secure"): return "ftps"
    return proto if proto in ("sftp", "ftp", "ftps") else "sftp"


def remote_path(p, sub):
    base = (p.get("remotePath") or "/").replace("\\", "/")
    parts = [x for x in (base.rstrip("/") + "/" + sub.strip("/")).split("/")]
    absolute = base.startswith("/")
    clean = "/".join(quote(x, safe="") for x in parts if x)
    return clean, absolute


def url(p, sub, folder):
    proto = protocol(p)
    clean, absolute = remote_path(p, sub)
    port = p.get("port") or (22 if proto == "sftp" else 21)
    host = p.get("host") or ""
    if proto == "sftp":
        # Relative remote paths start in the login's home.
        path = ("/" if absolute else "/~/") + clean
    else:
        # FTP paths are relative to the login folder (the extension's behaviour too).
        path = "/" + clean
    if folder and not path.endswith("/"): path += "/"
    return f"{'ftp' if proto == 'ftps' else proto}://{host}:{port}{path}"


def q(value):
    return '"' + str(value).replace("\\", "\\\\").replace('"', '\\"') + '"'


def curl(p, target, extra=()):
    lines = [f"url = {q(target)}", "silent", "show-error", "max-time = 25",
             f"connect-timeout = {max(1, int((p.get('connectTimeout') or 10000) / 1000))}"]
    user = p.get("username") or ""
    if p.get("password") is not None:
        lines.append(f"user = {q(user + ':' + str(p['password']))}")
    else:
        lines.append(f"user = {q(user + ':')}")
    key = p.get("privateKeyPath")
    if key:
        lines.append(f"key = {q(os.path.expanduser(key))}")
        if p.get("passphrase") not in (None, True):
            lines.append(f"pass = {q(p['passphrase'])}")
    if protocol(p) == "ftps":
        lines.append("ssl-reqd")
    if p.get("strictHostKeyChecking") is False:
        lines.append("insecure")
    lines.extend(extra)
    env = dict(os.environ)
    if p.get("agent"):
        env["SSH_AUTH_SOCK"] = os.path.expanduser(p["agent"])
    try:
        r = subprocess.run(["curl", "-K", "-"], input="\n".join(lines).encode(), capture_output=True, env=env, timeout=28)
    except subprocess.TimeoutExpired:
        out({"error": CURL_ERRORS[28]}, 1)
    if r.returncode != 0:
        msg = CURL_ERRORS.get(r.returncode) or r.stderr.decode(errors="replace").strip().removeprefix("curl: ") or f"curl failed ({r.returncode})"
        out({"error": msg, "code": r.returncode}, 1)
    return r.stdout


PERSIST = "30m"
SSH_ERRORS = [
    ("Permission denied", "Login failed: check username, password or key"),
    ("Host key verification failed", "The server's host key changed: check ~/.ssh/known_hosts"),
    ("REMOTE HOST IDENTIFICATION HAS CHANGED", "The server's host key changed: check ~/.ssh/known_hosts"),
    ("Could not resolve", "Could not resolve the host"),
    ("timed out", "The server did not answer in time"),
    ("Connection refused", "Could not connect to the server"),
    ("No such file", "No such file or folder on the server"),
    ("ermission denied", "Access denied on the server"),
]


def ssh_options(p):
    """Options shared by the background connection, batch requests and the interactive session."""
    opts = ["-o", f"ControlPath={os.path.expanduser('~/.ssh/control-%C')}",
            "-o", f"ConnectTimeout={max(1, int((p.get('connectTimeout') or 10000) / 1000))}",
            "-o", "ServerAliveInterval=30",
            "-o", "StrictHostKeyChecking=" + ("no" if p.get("strictHostKeyChecking") is False else "accept-new")]
    if p.get("privateKeyPath"): opts += ["-i", os.path.expanduser(p["privateKeyPath"])]
    return opts


def ssh_env(cfg, index, p):
    env = dict(os.environ)
    if p.get("agent"): env["SSH_AUTH_SOCK"] = os.path.expanduser(p["agent"])
    if p.get("password") is not None or p.get("passphrase") not in (None, True):
        env.update(SSH_ASKPASS=os.path.abspath(__file__), SSH_ASKPASS_REQUIRE="force",
                   REMOTE_ASKPASS=json.dumps([os.path.abspath(cfg), int(index)]))
    return env


def ssh_error(stderr, fallback):
    text = stderr.decode(errors="replace") if isinstance(stderr, bytes) else stderr
    for needle, message in SSH_ERRORS:
        if needle in text: return message
    lines = [l for l in text.splitlines() if l.strip() and not l.startswith(("sftp>", "Warning: Permanently added"))]
    return lines[-1].strip() if lines else fallback


def login(p):
    return f"{p.get('username')}@{p.get('host')}"


def connect(cfg, index, p):
    """Starts the shared background connection unless one is already up."""
    env, opts = ssh_env(cfg, index, p), ssh_options(p)
    port = ["-p", str(p.get("port") or 22)]
    check = subprocess.run(["ssh", *opts, *port, "-O", "check", login(p)], capture_output=True, stdin=subprocess.DEVNULL, env=env)
    if check.returncode == 0: return
    try:
        r = subprocess.run(["ssh", "-fN", "-o", "ControlMaster=yes", "-o", f"ControlPersist={PERSIST}", "-o", "NumberOfPasswordPrompts=1",
                            *opts, *port, login(p)], capture_output=True, stdin=subprocess.DEVNULL, env=env, timeout=25)
    except subprocess.TimeoutExpired:
        out({"error": "The server did not answer in time"}, 1)
    if r.returncode != 0: out({"error": ssh_error(r.stderr, "Could not connect")}, 1)


def sftp(cfg, index, p, commands):
    """Runs sftp batch commands over the shared connection; returns stdout without the echoes."""
    connect(cfg, index, p)
    try:
        r = subprocess.run(["sftp", "-q", "-o", "ControlMaster=no", *ssh_options(p), "-P", str(p.get("port") or 22), "-b", "-", login(p)],
                           input="\n".join(commands).encode(), capture_output=True, env=ssh_env(cfg, index, p), timeout=28)
    except subprocess.TimeoutExpired:
        out({"error": "The server did not answer in time"}, 1)
    if r.returncode != 0: out({"error": ssh_error(r.stderr, "sftp failed")}, 1)
    return b"\n".join(l for l in r.stdout.split(b"\n") if not l.startswith(b"sftp>"))


def sq(value):
    """A path quoted for an sftp batch line."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def plain_path(p, sub):
    """The remote path as sftp wants it: absolute, or relative to the login's home."""
    base = (p.get("remotePath") or "/").replace("\\", "/")
    parts = [x for x in (base.rstrip("/") + "/" + sub.strip("/")).split("/") if x]
    return ("/" if base.startswith("/") else "") + "/".join(parts) or "."


def askpass():
    cfg, index = json.loads(os.environ["REMOTE_ASKPASS"])
    p = profiles(cfg)[index]
    prompt = " ".join(sys.argv[1:]).lower()
    if "yes/no" in prompt: print("no")
    elif "passphrase" in prompt: print(p.get("passphrase") or "")
    else: print(p.get("password") or "")
    sys.exit(0)


def parse_listing(raw):
    """Unix `ls -l` lines (sftp and most FTP servers); also IIS/DOS-style FTP lines."""
    entries = []
    for line in raw.decode("utf-8", errors="replace").splitlines():
        m = re.match(r"^([\-dlbcps])[rwxsStT\-]{9}\S*\s+\S+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s(.*)$", line)
        if m:
            kind, size, name = m.groups()
            link = kind == "l"
            if link and " -> " in name: name = name.split(" -> ", 1)[0]
            entries.append({"name": name, "dir": kind == "d", "link": link, "size": int(size)})
            continue
        m = re.match(r"^\d\d-\d\d-\d\d\s+\d\d:\d\d[AP]M\s+(<DIR>|\d+)\s+(.*)$", line)
        if m:
            entries.append({"name": m.group(2), "dir": m.group(1) == "<DIR>", "link": False, "size": 0 if m.group(1) == "<DIR>" else int(m.group(1))})
    entries = [e for e in entries if e["name"] not in (".", "..", "")]
    entries.sort(key=lambda e: (not (e["dir"] or e["link"]), e["name"].lower()))
    return entries


def local_root(cfg, p):
    project = os.path.dirname(os.path.dirname(os.path.abspath(cfg)))
    return os.path.normpath(os.path.join(project, p.get("context") or "."))


def local_path(cfg, p, sub):
    root = local_root(cfg, p)
    target = os.path.normpath(os.path.join(root, sub.strip("/")))
    if target != root and not target.startswith(root + os.sep):
        out({"error": "That path leaves the project folder"}, 1)
    return target


def unsaved(path):
    """Why replacing the local file would lose work, or None."""
    if not os.path.exists(path): return None
    r = subprocess.run(["git", "status", "--porcelain", "--", os.path.basename(path)], cwd=os.path.dirname(path), capture_output=True, text=True)
    if r.returncode != 0: return "This local file isn't in git: replacing it can't be undone"
    if r.stdout.strip(): return "The local file has uncommitted changes"
    return None


def ignored(p, rel):
    """The "ignore" pattern (gitignore-like, as the extension reads it) matching rel, or None."""
    parts = rel.split("/")
    for pattern in p.get("ignore") or []:
        pat = str(pattern).strip().strip("/")
        if not pat: continue
        if pat.endswith("/**"): pat = pat[:-3]
        if "/" in pat:
            if fnmatch.fnmatchcase(rel, pat) or rel.startswith(pat + "/"): return pattern
        elif any(fnmatch.fnmatchcase(part, pat) for part in parts):
            return pattern
    return None


def main():
    if os.environ.get("REMOTE_ASKPASS") and (len(sys.argv) < 2 or sys.argv[1] not in ("info", "list", "get", "download", "shell", "upload")):
        askpass()
    if len(sys.argv) < 3: out({"error": "usage: remote.py info|list|get|shell <sftp.json> ..."}, 2)
    cmd, cfg = sys.argv[1], sys.argv[2]
    if cmd == "info":
        out([{"name": p.get("name") or p.get("host") or "server", "protocol": protocol(p), "host": p.get("host") or "",
              "port": p.get("port"), "username": p.get("username") or "", "remotePath": p.get("remotePath") or "/",
              "auth": "agent" if p.get("agent") else "key" if p.get("privateKeyPath") else "password" if p.get("password") is not None else "default"}
             for p in profiles(cfg)])
    index = sys.argv[3] if len(sys.argv) > 3 else "0"
    p = pick(cfg, index)
    sub = sys.argv[4] if len(sys.argv) > 4 else ""
    ssh = protocol(p) == "sftp"
    if cmd == "list":
        raw = sftp(cfg, index, p, [f"cd {sq(plain_path(p, sub))}", "ls -la"]) if ssh else curl(p, url(p, sub, True))
        entries = parse_listing(raw)
        out({"entries": entries[:MAX_ENTRIES], "limited": len(entries) > MAX_ENTRIES})
    if cmd == "get":
        if ssh:
            # sftp can't fetch part of a file: check the size, then fetch small files whole.
            info = parse_listing(sftp(cfg, index, p, [f"ls -ln {sq(plain_path(p, sub))}"]))
            if info and info[0]["size"] > 4_000_000: out({"error": "Too large to preview: download it instead"}, 1)
            import tempfile
            with tempfile.TemporaryDirectory() as tmp:
                sftp(cfg, index, p, [f"get {sq(plain_path(p, sub))} {sq(tmp + '/f')}"])
                with open(tmp + "/f", "rb") as f: data = f.read(PREVIEW + 1)
        else:
            data = curl(p, url(p, sub, False), [f"range = 0-{PREVIEW}"])
        if b"\0" in data[:8192]: out({"binary": True})
        out({"text": data[:PREVIEW].decode("utf-8", errors="replace"), "truncated": len(data) > PREVIEW})
    if cmd == "download":
        target = local_path(cfg, p, sub)
        if os.path.isdir(target): out({"error": "A local folder has that name"}, 1)
        force = len(sys.argv) > 5 and sys.argv[5] == "force"
        warning = None if force else unsaved(target)
        if warning: out({"confirm": warning, "local": target})
        os.makedirs(os.path.dirname(target), exist_ok=True)
        temp = os.path.join(os.path.dirname(target), f".{os.path.basename(target)}.remote-download")
        try:
            if ssh: sftp(cfg, index, p, [f"get {sq(plain_path(p, sub))} {sq(temp)}"])
            else: curl(p, url(p, sub, False), [f"output = {q(temp)}"])
            if os.path.exists(target): os.chmod(temp, os.stat(target).st_mode & 0o7777)
            os.replace(temp, target)
        finally:
            if os.path.exists(temp): os.remove(temp)
        out({"local": target, "bytes": os.path.getsize(target)})
    if cmd == "upload":
        source = os.path.realpath(sub)
        root = os.path.realpath(local_root(cfg, p))
        if not source.startswith(root + os.sep): out({"error": "This file isn't under the folder sftp.json uploads from"}, 1)
        if not os.path.isfile(source): out({"error": "Only existing files can be uploaded"}, 1)
        rel = os.path.relpath(source, root).replace(os.sep, "/")
        rule = ignored(p, rel)
        if rule: out({"error": f"sftp.json ignores this file ({rule})"}, 1)
        if ssh:
            remote = plain_path(p, rel)
            folders, parent = [], os.path.dirname(remote)
            while parent and parent not in ("/", "."):
                folders.insert(0, parent); parent = os.path.dirname(parent)
            # "-" lets a batch line fail (the folder already exists).
            sftp(cfg, index, p, [f"-mkdir {sq(f)}" for f in folders] + [f"put {sq(source)} {sq(remote)}"])
        else:
            curl(p, url(p, rel, False), [f"upload-file = {q(source)}", "ftp-create-dirs"])
        out({"remote": plain_path(p, rel), "bytes": os.path.getsize(source)})
    if cmd == "shell":
        if protocol(p) != "sftp": out({"error": "An interactive session needs sftp"}, 1)
        connect(cfg, index, p)
        path = plain_path(p, sub)
        argv = ["sftp", "-o", "ControlMaster=no", *ssh_options(p), "-P", str(p.get("port") or 22), login(p) + (f":{path}" if path != "." else "")]
        if p.get("agent"): argv = ["env", f"SSH_AUTH_SOCK={os.path.expanduser(p['agent'])}"] + argv
        out(argv)
    out({"error": f"unknown command {cmd}"}, 2)


if __name__ == "__main__":
    main()
