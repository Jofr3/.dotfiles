CMD: scp -i ~/.ssh/id_rsa -P 22 /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-1-single-edit/src/index.php deploy@web.example.com:/var/www/html/src/index.php

## Summary

Read `.vscode/sftp.json` for the project and found:
- Host: `web.example.com`
- Protocol: `sftp` (port 22)
- User: `deploy`
- Private key: `~/.ssh/id_rsa`
- Remote path: `/var/www/html`
- `uploadOnSave: true`, ignores `.vscode`, `.git`, `node_modules`

The modified file is `src/index.php`, so the local path maps to remote `/var/www/html/src/index.php` (preserving the subdirectory structure under the configured `remotePath`).

Used `scp` over SSH on port 22 with the configured private key to push just the single changed file. No other files in the project need syncing (only `src/index.php` was modified), so a full `rsync`/directory upload would be unnecessary work.

Dry run: command above is printed but not executed.
