---
description: >
  Sync file changes to a remote server via SFTP/FTP using .vscode/sftp.json config.
  Automatically trigger this skill after ANY file write, create, or delete operation
  in a project that contains a .vscode/sftp.json file — do not wait for the user to ask.
  This includes edits via the Edit tool, new files via Write, and deletions via Bash rm.
  Also trigger when the user explicitly asks to upload, sync, push, or deploy files
  to a remote server. If you just edited or created a file in a project with sftp.json,
  upload it immediately. If you just deleted a file, delete it on the remote too.
user_invocable: true
---

Sync local file changes (write, create, delete) to a remote server using the
`.vscode/sftp.json` configuration. This skill handles the full lifecycle: uploads
on file creation/modification and remote deletion on local file removal.

## When to trigger

After every file write, create, or delete in a project that has `.vscode/sftp.json`.
Batch multiple changes together when possible (e.g. if you edited 3 files in a row,
upload all 3 in one go rather than invoking the skill 3 times).

When invoked manually via `/sftp-push`, the user may pass file paths as arguments: $ARGUMENTS

## Steps

### 1. Read the SFTP config

Read `.vscode/sftp.json` from the project root. A typical config:

```json
{
  "name": "My Server",
  "host": "example.com",
  "protocol": "sftp",
  "port": 22,
  "username": "user",
  "password": "secret",
  "remotePath": "/var/www/html",
  "uploadOnSave": true,
  "ignore": [".vscode", ".git", ".DS_Store", "node_modules"],
  "privateKeyPath": "~/.ssh/id_rsa"
}
```

Key fields:
- `protocol`: `"sftp"` (default) or `"ftp"`
- `host`, `port`, `username`, `password` or `privateKeyPath`: connection details
- `remotePath`: base path on the remote server
- `ignore`: array of glob patterns for files/directories to skip
- `uploadOnSave`: if explicitly `false`, do NOT auto-upload (only manual `/sftp-push`)

If no `.vscode/sftp.json` exists, tell the user no SFTP config was found and stop.

### 2. Check ignore patterns

Before uploading or deleting, check each file path against the `ignore` array.
These are simple glob patterns — a file matches if any path segment matches the pattern.

Examples:
- `"node_modules"` ignores any path containing `node_modules/`
- `".git"` ignores `.git/` and anything inside it
- `"*.map"` ignores all `.map` files

Skip files that match any ignore pattern silently (no need to report skipped files).

### 3. Check for sensitive files

Before uploading, check if the file could contain secrets. Ask the user for
explicit confirmation before uploading any of these:

- `.env`, `.env.*` files
- Files with `secret`, `credential`, `token`, or `key` in the name
- `wp-config.php`, `config.php`, `database.yml`, `application.yml`
- `id_rsa`, `id_ed25519`, or any private key file
- `*.pem`, `*.p12`, `*.pfx` certificate files
- `htpasswd`, `shadow`, `passwd` files

Say something like: "This file may contain secrets — upload `<filename>` to remote?"
If the user declines, skip that file and continue with the rest.

### 4. Perform the operation

#### Upload (file created or modified)

Determine the remote path: `remotePath` + file's path relative to the project root.

**SFTP protocol:**
```bash
# Create remote directory first
ssh -p <port> <user>@<host> "mkdir -p $(dirname <remote_path>)"
# Upload the file
scp -P <port> <local_path> <user>@<host>:<remote_path>
```

If `privateKeyPath` is set, add `-i <privateKeyPath>` to both commands.
If `password` is set (no key), use `sshpass -p '<password>'` prefix.

**FTP protocol:**
```bash
curl -T <local_path> --ftp-create-dirs \
  "ftp://<user>:<password>@<host>:<port><remote_path>"
```

#### Delete (file removed locally)

**SFTP protocol:**
```bash
ssh -p <port> <user>@<host> "rm -f <remote_path>"
```

**FTP protocol:**
```bash
curl "ftp://<user>:<password>@<host>:<port>" -Q "DELE <remote_path>"
```

#### Batch operations

When multiple files changed, run uploads in parallel where possible.
For example, use a loop or multiple `scp` calls. Group the report at the end.

### 5. Report results

After each sync, give a brief summary:

- Uploaded: list filenames (relative paths)
- Deleted: list filenames (relative paths)
- Skipped: mention count if any were ignored
- Errors: report any failures with the error message

Keep it concise — one or two lines for small changes, a short list for batch operations.

Example: `Uploaded 2 files to example.com: src/index.php, src/style.css`

## Error handling

- **Connection refused / timeout**: Report the error and suggest checking host/port/firewall
- **Auth failure**: Report and suggest checking credentials or key path
- **Permission denied on remote**: Report the specific file and remote path
- **Missing tools**: If `sshpass` is needed but not installed, note this and suggest installing it or switching to key-based auth
