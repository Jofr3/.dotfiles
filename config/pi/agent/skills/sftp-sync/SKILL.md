---
name: sftp-sync
description: Automatic SFTP/FTP file sync for remote projects. Files are uploaded to the remote server immediately after every write/edit, so browser automation and manual inspection always see the latest changes. Use when working on projects deployed via SFTP/FTP with a .vscode/sftp.json config.
---

# SFTP Sync

This project syncs files to a remote server via SFTP or FTP. An extension automatically uploads every file you write or edit.

## How It Works

- The extension reads `.vscode/sftp.json` from the project root for connection details.
- After every successful `write` or `edit` tool call, the changed file is uploaded to the remote server **immediately**, before the next tool runs.
- After every `bash` tool call, the extension detects files modified during execution (via timestamp comparison) and uploads them automatically.
- The tool result includes `[SFTP synced to <host>]` confirmation so you know the remote has the latest version.
- Files matching the `ignore` patterns in the config are skipped.

This means **browser automation feedback loops work correctly** — when you edit a file and then inspect the site with `browser_use`, the remote server already has the updated file.

## Commands

| Command | Description |
|---------|-------------|
| `/sftp-push <path>` | Manually upload a specific file |
| `/sftp-status` | Show current connection config, auth method, and upload count |

## Important Notes

- The status bar shows `⬆ SFTP` when active.
- Upload failures are reported as errors and appended to the tool result.
- The extension supports both **SFTP** (SSH key or password via `sshpass`) and **FTP** (via `curl`).

## Config Format (`.vscode/sftp.json`)

```json
{
    "name": "My Server",
    "protocol": "sftp",
    "host": "example.com",
    "port": 22,
    "username": "deploy_user",
    "privateKeyPath": "/home/user/.ssh/id_rsa",
    "remotePath": "/var/www/html",
    "ignore": [".vscode", ".git", "node_modules"]
}
```

FTP example:

```json
{
    "protocol": "ftp",
    "host": "ftp.example.com",
    "port": 21,
    "username": "ftp_user",
    "password": "secret",
    "remotePath": "/public_html",
    "ignore": [".git"]
}
```
