# SFTP Sync (Dry Run)

## SFTP Configuration

Project: `/home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-5-ignore-pattern`

Config file `.vscode/sftp.json`:
- host: `server.example.com`
- port: `22`
- protocol: `sftp`
- username: `deploy`
- privateKeyPath: `~/.ssh/id_rsa`
- remotePath: `/var/www/site`
- ignore: `[".vscode", ".git", "node_modules", "*.map"]`

## File Analysis

Two files were edited:

1. `node_modules/lodash/index.js` — **SKIPPED**: matches the `node_modules` entry in the `ignore` list. This is a third-party dependency and should not be synced to the remote server.
2. `src/main.js` — **WILL SYNC**: not matched by any ignore pattern.

## Commands

Only `src/main.js` is uploaded. The remote directory structure mirrors the local path relative to the project root, so it lands at `/var/www/site/src/main.js`.

```
CMD: sftp -i ~/.ssh/id_rsa -P 22 -o StrictHostKeyChecking=accept-new deploy@server.example.com <<EOF
put /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-5-ignore-pattern/src/main.js /var/www/site/src/main.js
bye
EOF
```

## Summary

- Honored the `ignore` pattern in `.vscode/sftp.json` — `node_modules/lodash/index.js` was excluded because `node_modules` is listed in `ignore`.
- Synced `src/main.js` to `deploy@server.example.com:/var/www/site/src/main.js` via SFTP on port 22 using the configured SSH private key.
- 1 of 2 edited files uploaded; 1 skipped per ignore rules.
