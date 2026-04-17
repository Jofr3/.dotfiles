# Sync: public/index.html (DRY RUN)

## Config detected

File: `/home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-6-ftp-protocol/.vscode/sftp.json`

```json
{
  "name": "Legacy FTP",
  "host": "legacy.example.com",
  "protocol": "ftp",
  "port": 21,
  "username": "ftpuser",
  "password": "ftppass",
  "remotePath": "/public_html",
  "uploadOnSave": true
}
```

Note the protocol is **`ftp`** (plain FTP on port 21), not SFTP. The standard `sftp`/`scp` tools won't work here — need an FTP client like `curl` or `lftp`.

## Path mapping

- Local:  `/home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-6-ftp-protocol/public/index.html`
- Remote: `/public_html/public/index.html`

## Commands (not executed — dry run)

Using `curl` (single-file upload via FTP):

```
CMD: curl -T /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-6-ftp-protocol/public/index.html --user 'ftpuser:ftppass' --ftp-create-dirs ftp://legacy.example.com:21/public_html/public/index.html
```

Alternative using `lftp` (also handles nested dirs cleanly):

```
CMD: lftp -u 'ftpuser,ftppass' -p 21 legacy.example.com -e 'mkdir -p -f /public_html/public; put -O /public_html/public /home/jofre/.dotfiles/config/claude/skills/sftp-push-workspace/mocks/eval-6-ftp-protocol/public/index.html; bye'
```

## Summary

- Detected `.vscode/sftp.json` uses plain FTP (protocol `ftp`, port 21), not SFTP — tool selection matters here.
- Mapped local `public/index.html` to remote `/public_html/public/index.html` (remotePath + relative project path).
- Credentials are embedded in the config (`ftpuser` / `ftppass`), passed inline to curl/lftp.
- No commands were actually run (dry run); both `curl -T` and `lftp put` forms shown as `CMD:` lines above.
- Warning worth flagging to the user: plain FTP sends credentials in the clear — the server name ("Legacy FTP") suggests this is known, but migrating to SFTP/FTPS would be safer.
