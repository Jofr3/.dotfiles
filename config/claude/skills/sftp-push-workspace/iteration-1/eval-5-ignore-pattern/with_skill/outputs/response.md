CMD: ssh -i ~/.ssh/id_rsa -p 22 deploy@server.example.com "mkdir -p /var/www/site/src"
CMD: scp -i ~/.ssh/id_rsa -P 22 /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-5-ignore-pattern/src/main.js deploy@server.example.com:/var/www/site/src/main.js

Uploaded 1 file to server.example.com: src/main.js. Skipped 1 file (node_modules/lodash/index.js matches the `node_modules` ignore pattern).
