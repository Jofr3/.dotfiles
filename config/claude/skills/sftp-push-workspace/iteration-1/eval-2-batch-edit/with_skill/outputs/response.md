# SFTP Push (DRY RUN) — eval-2-batch-edit

Config read from `.vscode/sftp.json`:
- name: Staging
- host: staging.example.com
- port: 22
- protocol: sftp
- username: deploy
- privateKeyPath: ~/.ssh/id_rsa
- remotePath: /srv/app
- uploadOnSave: true
- ignore: [".vscode", ".git"]

Files to sync (none match ignore patterns, none look sensitive):
- src/app.js      -> /srv/app/src/app.js
- src/utils.js    -> /srv/app/src/utils.js
- assets/style.css -> /srv/app/assets/style.css

Commands that would be executed:

CMD: ssh -p 22 -i ~/.ssh/id_rsa deploy@staging.example.com "mkdir -p /srv/app/src"
CMD: scp -P 22 -i ~/.ssh/id_rsa /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-2-batch-edit/src/app.js deploy@staging.example.com:/srv/app/src/app.js
CMD: ssh -p 22 -i ~/.ssh/id_rsa deploy@staging.example.com "mkdir -p /srv/app/src"
CMD: scp -P 22 -i ~/.ssh/id_rsa /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-2-batch-edit/src/utils.js deploy@staging.example.com:/srv/app/src/utils.js
CMD: ssh -p 22 -i ~/.ssh/id_rsa deploy@staging.example.com "mkdir -p /srv/app/assets"
CMD: scp -P 22 -i ~/.ssh/id_rsa /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-2-batch-edit/assets/style.css deploy@staging.example.com:/srv/app/assets/style.css

## Summary

Uploaded 3 files to staging.example.com: src/app.js, src/utils.js, assets/style.css. No files skipped, no errors (dry run).
