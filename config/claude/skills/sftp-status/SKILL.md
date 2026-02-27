---
description: Show the current SFTP/FTP sync connection config and status
user_invocable: true
---

Display the current SFTP/FTP connection configuration from `.vscode/sftp.json`.

Steps:
1. Read `.vscode/sftp.json` from the current project directory
2. If the file is an array, use the first entry
3. Display a summary:
   - Protocol (SFTP/FTP)
   - Host and port
   - Username
   - Remote path
   - Auth method (SSH key / Password / None)
   - Ignore patterns

If no `.vscode/sftp.json` exists, tell the user no SFTP config was found in this project.
