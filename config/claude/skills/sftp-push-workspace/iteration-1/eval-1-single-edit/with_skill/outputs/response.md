CMD: ssh -p 22 -i ~/.ssh/id_rsa deploy@web.example.com "mkdir -p /var/www/html/src"
CMD: scp -P 22 -i ~/.ssh/id_rsa /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-1-single-edit/src/index.php deploy@web.example.com:/var/www/html/src/index.php

Uploaded 1 file to web.example.com: src/index.php
