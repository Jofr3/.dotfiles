---
description: Upload a file to the remote server via SFTP/FTP using the .vscode/sftp.json config
user_invocable: true
---

Upload a specific file to the remote server configured in `.vscode/sftp.json`.

Steps:
1. Read `.vscode/sftp.json` from the current project directory to get the connection config
2. The user provides a file path as the argument: $ARGUMENTS
3. Determine the remote path by combining `remotePath` from the config with the file's relative path
4. Upload using the appropriate protocol:
   - **SFTP**: Use `scp` (with `sshpass` for password auth, or `-i` for key auth). Create the remote directory first with `ssh mkdir -p`.
   - **FTP**: Use `curl -T` with `--ftp-create-dirs`
5. Report success or failure to the user

If no argument is provided, ask the user which file to upload.
If no `.vscode/sftp.json` exists, tell the user no SFTP config was found.
