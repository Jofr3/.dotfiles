# Propagate deletion of `old/deprecated.js` to remote

## Plan

The project at `/home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-3-delete` has a `.vscode/sftp.json` with:

- host: `dev.example.com`
- port: `22`
- username: `deploy`
- privateKeyPath: `~/.ssh/id_rsa`
- remotePath: `/home/deploy/app`
- protocol: `sftp`

Local file `old/deprecated.js` (now deleted locally) maps to remote `/home/deploy/app/old/deprecated.js`. To propagate the deletion, remove the file on the remote via SSH.

## Commands (dry run — not executed)

CMD: ssh -i ~/.ssh/id_rsa -p 22 -o StrictHostKeyChecking=accept-new deploy@dev.example.com 'rm -f /home/deploy/app/old/deprecated.js'

## Summary

- Detected the project's SFTP config at `.vscode/sftp.json`.
- Mapped the locally deleted path `old/deprecated.js` under the configured `remotePath` to `/home/deploy/app/old/deprecated.js`.
- Single remote `rm -f` over SSH (using the configured private key, port, and user) is sufficient to propagate the deletion. `-f` ensures idempotency if the file is already gone.
- Left the parent `old/` directory in place since only the specific file was deleted locally (the directory still exists locally and may hold other files in general; no directory removal requested).
- No network commands were executed per dry-run rules.
