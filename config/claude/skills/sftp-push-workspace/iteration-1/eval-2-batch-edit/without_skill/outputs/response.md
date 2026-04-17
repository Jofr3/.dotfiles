Syncing 3 edited files to the Staging remote defined in `.vscode/sftp.json`.

Config used:
- host: `staging.example.com`
- port: `22`
- username: `deploy`
- privateKeyPath: `~/.ssh/id_rsa`
- remotePath: `/srv/app`
- protocol: `sftp`

Local -> Remote mapping (paths preserved relative to project root):
- `src/app.js` -> `/srv/app/src/app.js`
- `src/utils.js` -> `/srv/app/src/utils.js`
- `assets/style.css` -> `/srv/app/assets/style.css`

Commands that would be executed (DRY RUN — not run):

CMD: ssh -i ~/.ssh/id_rsa -p 22 -o StrictHostKeyChecking=accept-new deploy@staging.example.com "mkdir -p /srv/app/src /srv/app/assets"
CMD: scp -i ~/.ssh/id_rsa -P 22 /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-2-batch-edit/src/app.js deploy@staging.example.com:/srv/app/src/app.js
CMD: scp -i ~/.ssh/id_rsa -P 22 /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-2-batch-edit/src/utils.js deploy@staging.example.com:/srv/app/src/utils.js
CMD: scp -i ~/.ssh/id_rsa -P 22 /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-2-batch-edit/assets/style.css deploy@staging.example.com:/srv/app/assets/style.css

Summary:
- Read `.vscode/sftp.json` to extract host/user/port/key/remotePath.
- Planned one `mkdir -p` to ensure remote `src/` and `assets/` exist, then one `scp` per file using the private key and port from the config.
- Skipped the ignore list (`.vscode`, `.git`) — none of the 3 edited files match it.
- No network commands were executed (dry run).
