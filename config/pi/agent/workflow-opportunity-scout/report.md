# Workflow Opportunity Scout Report

Generated: 2026-05-19T12:37:34.639Z
CWD: `/home/jofre/lsw/ateinsa`
Store: `/home/jofre/.pi/agent/workflow-opportunity-scout`

## Summary

- Active suggestions: 7
- Prompt patterns tracked: 6
- Repeated bash command patterns tracked: 38
- Tool sequences tracked: 17
- Tool problem patterns tracked: 5
- Known resources: 14 skills, 8 extensions, 1 context files

## Top Suggestions

### 📘 Launcher scripts and JSON menu workflow

- Kind: skill
- Suggested name: `launcher-scripts-workflow`
- Confidence: 80% (6 signal(s), source: prompt-pattern)
- Target: `~/.pi/agent/skills/launcher-scripts-workflow/SKILL.md`
- Why: Your launcher scripts use repo-specific JSON files and Hyprland bindings; repeated edits are good candidates for a small skill with examples and gotchas.
- Action: Create a skill covering apps/bookmarks/password launcher JSON schema, script conventions, Hyprland keybindings, and safe handling of private password files.
- Evidence:
  - move the "no compactar" /tmp/pi-clipboard-aa114bb6-aa1f-4c57-942a-f23856c6de79.png before the "compactar option". Move the "En cas que se’m concedeixi l’ajut de menjador parcial del 70% estic interessat/da en compactar la beca d’acord amb la clàusula 7a de les bases de la convoc…
  - good. Some empreses have this: /tmp/nix-shell.6WCsq0/pi-clipboard-dddc335b-580b-4823-8092-810971cfb899.png is this normal?
  - client says this: "Comentarte que tenemos un CAE de la empresa NESTLE ESPAÑA que es oficina técnica y no nos esta calculando correctamente los honorarios. Nosotros tenemos entrados el contrato correctamente con su escalado y hemos entrado el anexo que seria la hora de oportunida…
  - client says: "Como puedes comprobar en producción esta la oferta entrada y todo esta correcto: /tmp/pi-clipboard-e136c70d-4fb8-4379-9536-3ad70703f6d3.png Pero cuando voy al apartado de Facturas porque hemos recibido la factura de SGS no me sale: /tmp/pi-clipboard-df60773f-9d54-4…

### 🧩 Automate recurring tool chain: database_query → bash:php -l app/Services/Usuari/TraspasService.php

- Kind: extension
- Suggested name: `database-query-bash-php-l-app-services-usuari-traspasservice-php-workflow`
- Confidence: 76% (5 signal(s), source: tool-sequence)
- Target: `~/.pi/agent/extensions/database-query-bash-php-l-app-services-usuari-traspasservice-php-workflow.ts`
- Why: A similar non-trivial tool chain has repeated 5 time(s). This may be a good fit for a command, wizard, or focused tool that coordinates the steps.
- Action: Create a Pi extension that wraps this recurring tool chain behind a slash command or custom tool, asks for the few required inputs, and records clear results.
- Evidence:
  - sync does not work correctly
  - i still cant remove a user from the empresa
  - good. Some empreses have this: /tmp/nix-shell.6WCsq0/pi-clipboard-dddc335b-580b-4823-8092-810971cfb899.png is this normal?
  - "SQLSTATE[22007]: [Microsoft][ODBC Driver 18 for SQL Server][SQL Server]La conversión del tipo de datos nvarchar en datetime produjo un valor fuera de intervalo. (Connection: sqlsrv, SQL: UPDATE usuaris_web_colaboradors_empresa SET data_fi = 2026-05-18 23:59:00 WHERE id = 68090 …

### 🧩 Automate repeated command: set -e

- Kind: extension
- Suggested name: `set-e-command`
- Confidence: 76% (4 signal(s), source: bash-command)
- Target: `~/.pi/agent/extensions/set-e-command.ts`
- Why: The command pattern `set -e` has appeared 4 time(s). Repeated shell commands are often better as Pi slash commands/tools with prompts, validation, status UI, and output truncation.
- Action: Create a Pi extension that exposes a slash command or tool for `set -e`, validates inputs, runs the command safely, shows progress, and summarizes/truncates output. Average runtime observed: 1.0s.
- Evidence:
  - set -e jar=$(mktemp) html=$(mktemp) url='https://dev.ajutsescolars.ccosona.cat/nova-solicitud/curs2627' code=$(curl -ksSL -c "$jar" -b "$jar" -o "$html" -w '%{http_code}' "$url") echo "HTTP $code" python3 - <<'PY' "$html" "$jar" import re,sys,os html=open(sys.argv[1],encoding='u…
  - set -e jar=$(mktemp) html=$(mktemp) # establish laravel cookies curl -ksSL -c "$jar" -b "$jar" -o "$html" 'https://dev.ajutsescolars.ccosona.cat/nova-solicitud/curs2627' xsrf=$(awk '$6=="XSRF-TOKEN"{print $7}' "$jar" | tail -1) python3 - <<'PY' "$xsrf" > /tmp/xsrf_decoded.txt im…
  - set -e jar=$(mktemp) html=$(mktemp) curl -ksSL -c "$jar" -b "$jar" -o "$html" 'https://dev.ajutsescolars.ccosona.cat/nova-solicitud/curs2627' xsrf=$(awk '$6=="XSRF-TOKEN"{print $7}' "$jar" | tail -1) xsrf_dec=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.unquote(sys.…
  - set -e python3 - <<'PY' import urllib.request url='http://dev-beques.ccosona.cat/auxiliars/get_ajudes_disponibles.php?id_municipi_alumne=45&id_curs_escolar=19&id_escola=59&id_nivell_curs=12&es_crae=0&from=2&escola_anterior=-1' print(url) data=urllib.request.urlopen(url, timeout=…

### 🧩 Automate recurring tool chain: bash:php -l app/Services/Usuari/TraspasService.php → database_query

- Kind: extension
- Suggested name: `bash-php-l-app-services-usuari-traspasservice-php-database-query-workflow`
- Confidence: 70% (4 signal(s), source: tool-sequence)
- Target: `~/.pi/agent/extensions/bash-php-l-app-services-usuari-traspasservice-php-database-query-workflow.ts`
- Why: A similar non-trivial tool chain has repeated 4 time(s). This may be a good fit for a command, wizard, or focused tool that coordinates the steps.
- Action: Create a Pi extension that wraps this recurring tool chain behind a slash command or custom tool, asks for the few required inputs, and records clear results.
- Evidence:
  - "SQLSTATE[22007]: [Microsoft][ODBC Driver 18 for SQL Server][SQL Server]La conversión del tipo de datos nvarchar en datetime produjo un valor fuera de intervalo. (Connection: sqlsrv, SQL: UPDATE usuaris_web_colaboradors_empresa SET data_fi = 2026-05-18 23:59:00 WHERE id = 68090 …
  - in the Selector column, select (multi) the current users that bellong to the empresa, and do a sync when saving the changes
  - /tmp/nix-shell.6WCsq0/pi-clipboard-c1dedba3-930a-4cfd-91ab-d65ff4ff9c36.png does not edit
  - /tmp/nix-shell.6WCsq0/pi-clipboard-803dd73c-f083-4de4-acc7-90e7e8b7d7a7.png when closing a user, it should show in the inactive tab, why does it not?

### 🧩 Automate repeated command: bunx --bun @mariozechner/pi-coding-agent

- Kind: extension
- Suggested name: `bunx-bun-mariozechner-pi-coding-agent-command`
- Confidence: 69% (3 signal(s), source: bash-command)
- Target: `~/.pi/agent/extensions/bunx-bun-mariozechner-pi-coding-agent-command.ts`
- Why: The command pattern `bunx --bun @mariozechner/pi-coding-agent` has appeared 3 time(s). Repeated shell commands are often better as Pi slash commands/tools with prompts, validation, status UI, and output truncation.
- Action: Create a Pi extension that exposes a slash command or tool for `bunx --bun @mariozechner/pi-coding-agent`, validates inputs, runs the command safely, shows progress, and summarizes/truncates output. Average runtime observed: 3.2s.
- Evidence:
  - bunx --bun @mariozechner/pi-coding-agent --help | head -80
  - bunx --bun @mariozechner/pi-coding-agent --no-extensions -e /home/jofre/.pi/agent/extensions/agent-browser.ts --list-models >/tmp/pi-extension-validate.out 2>/tmp/pi-extension-validate.err; code=$?; if [ $code -eq 0 ]; then echo 'OK: pi loaded extension for --list-models'; else …

### 🧩 Automate repeated command: git -C /home/jofre/.dotfiles

- Kind: extension
- Suggested name: `git-c-home-jofre-dotfiles-command`
- Confidence: 69% (3 signal(s), source: bash-command)
- Target: `~/.pi/agent/extensions/git-c-home-jofre-dotfiles-command.ts`
- Why: The command pattern `git -C /home/jofre/.dotfiles` has appeared 3 time(s). Repeated shell commands are often better as Pi slash commands/tools with prompts, validation, status UI, and output truncation.
- Action: Create a Pi extension that exposes a slash command or tool for `git -C /home/jofre/.dotfiles`, validates inputs, runs the command safely, shows progress, and summarizes/truncates output. Average runtime observed: 23ms.
- Evidence:
  - git -C /home/jofre/.dotfiles status --short -- config/pi/agent/skills/nix-dotfiles-workflow/SKILL.md
  - git -C /home/jofre/.dotfiles status --short -- config/pi/agent/extensions/agent-browser.ts
  - git -C /home/jofre/.dotfiles diff -- config/pi/agent/extensions/agent-browser.ts | sed -n '1,220p' && git -C /home/jofre/.dotfiles status --short -- config/pi/agent/extensions/agent-browser.ts

### 🧩 Automate repeated command: python - <<'PY'

- Kind: extension
- Suggested name: `python-py-command`
- Confidence: 69% (3 signal(s), source: bash-command)
- Target: `~/.pi/agent/extensions/python-py-command.ts`
- Why: The command pattern `python - <<'PY'` has appeared 3 time(s). Repeated shell commands are often better as Pi slash commands/tools with prompts, validation, status UI, and output truncation.
- Action: Create a Pi extension that exposes a slash command or tool for `python - <<'PY'`, validates inputs, runs the command safely, shows progress, and summarizes/truncates output. Average runtime observed: 75ms.
- Evidence:
  - python - <<'PY' from pathlib import Path p = Path('/home/jofre/.pi/agent/skills/bash-error-recovery-playbook/SKILL.md') text = p.read_text() assert text.startswith('---\n'), 'missing opening frontmatter' end = text.find('\n---\n', 4) assert end != -1, 'missing closing frontmatte…
  - python - <<'PY' from pathlib import Path p = Path('/home/jofre/.pi/agent/skills/nix-dotfiles-workflow/SKILL.md') text = p.read_text() assert text.startswith('---\n'), 'missing opening frontmatter' end = text.find('\n---\n', 4) assert end != -1, 'missing closing frontmatter' fron…
  - python - <<'PY' from pathlib import Path p = Path('AGENTS.md') text = p.read_text() count = text.count('```') print(f'{p}: {count} markdown fences ({"balanced" if count % 2 == 0 else "unbalanced"})') PY

## Prompt Pattern Signals

| Pattern | Kind | Count | Confidence | Proposed name | Last seen |
| --- | --- | ---: | ---: | --- | --- |
| Launcher scripts and JSON menu workflow | skill | 6 | 56% | `launcher-scripts-workflow` | 2026-05-19T11:00:59.730Z |
| NixOS/Home Manager dotfiles workflow | skill | 4 | 50% | `nix-dotfiles-workflow` | 2026-05-18T09:08:28.470Z |
| Release/commit automation workflow | extension | 3 | 47% | `release-ship-workflow` | 2026-05-15T13:00:03.133Z |
| Database inspection/change workflow | skill | 3 | 47% | `database-change-workflow` | 2026-05-18T10:53:46.201Z |
| Pi skill/extension authoring playbook | skill | 1 | 68% | `pi-skill-extension-authoring` | 2026-05-18T09:08:28.470Z |
| Project-specific debugging playbook | skill | 1 | 46% | `project-debugging-playbook` | 2026-05-18T09:08:28.471Z |

## Repeated Bash Command Signals

| Command pattern | Count | Errors | Avg | Max | Last seen |
| --- | ---: | ---: | ---: | ---: | --- |
| `npm run` | 18 | 0 | 1.7s | 2.9s | 2026-05-18T07:55:54.956Z |
| `php -l app/Services/Usuari/TraspasService.php` | 17 | 0 | 152ms | 520ms | 2026-05-18T11:02:45.770Z |
| `bun run` | 13 | 1 | 1.8s | 2.7s | 2026-05-19T06:28:08.994Z |
| `cd ~/lsw/beques &&` | 7 | 2 | 40ms | 62ms | 2026-05-15T12:30:37.061Z |
| `set -e` | 4 | 0 | 1.0s | 1.6s | 2026-05-18T06:11:51.506Z |
| `python - <<'PY'` | 3 | 0 | 75ms | 133ms | 2026-05-19T06:48:57.576Z |
| `git -C /home/jofre/.dotfiles` | 3 | 0 | 23ms | 27ms | 2026-05-18T08:37:07.479Z |
| `bunx --bun @mariozechner/pi-coding-agent` | 3 | 0 | 3.2s | 7.0s | 2026-05-18T08:36:43.102Z |
| `bun run dev` | 3 | 0 | 45ms | 85ms | 2026-05-19T06:47:41.479Z |
| `cd ~/lsw/beques/auxiliars &&` | 2 | 2 | 51ms | 51ms | 2026-05-15T12:29:07.713Z |
| `curl -sSL 'https://dev-beques.ccosona.cat/auxiliars/get_ajudes_disponibles.php?id_municipi_alumne=45&id_curs_escolar=19&id_escola=62&id_nivell_curs=12&es_crae=0&from=2&escola_anterior=-1&id_alumne_r=100197'` | 2 | 0 | 200ms | 226ms | 2026-05-15T12:31:39.982Z |
| `git commit` | 2 | 0 | 24ms | 27ms | 2026-05-15T13:01:25.668Z |
| `pwd && ls` | 2 | 0 | 458ms | 618ms | 2026-05-19T11:01:21.206Z |
| `tsc` | 2 | 2 | 810ms | 1.2s | 2026-05-18T08:57:20.381Z |
| `pwd && find` | 2 | 0 | 119ms | 215ms | 2026-05-18T10:32:19.496Z |
| `cd /home/jofre/lsw/renovacions &&` | 1 | 0 | 78ms | 78ms | 2026-05-15T12:28:17.733Z |
| `curl -sS 'http://dev-beques.ccosona.cat/auxiliars/get_ajudes_disponibles.php?id_municipi_alumne=45&id_curs_escolar=19&id_escola=62&id_nivell_curs=12&es_crae=0&from=2&escola_anterior=-1&id_alumne_r=100197'` | 1 | 0 | 156ms | 156ms | 2026-05-15T12:30:07.455Z |
| `scp -i /home/jofre/.ssh/keys/jofre_key.pem` | 1 | 0 | 1.7s | 1.7s | 2026-05-15T12:31:34.666Z |
| `php -l /home/jofre/lsw/beques/funcions.utility.php` | 1 | 0 | 74ms | 74ms | 2026-05-15T12:31:55.468Z |
| `curl -sS -X` | 1 | 0 | 166ms | 166ms | 2026-05-15T12:32:02.033Z |
| `git add config/claude/.last-cleanup` | 1 | 0 | 28ms | 28ms | 2026-05-15T12:56:57.761Z |
| `git log --oneline` | 1 | 0 | 26ms | 26ms | 2026-05-15T13:00:33.120Z |
| `git show --stat` | 1 | 0 | 19ms | 19ms | 2026-05-15T13:00:46.396Z |
| `git push` | 1 | 0 | 1.4s | 1.4s | 2026-05-15T13:01:35.741Z |
| `pwd && rg` | 1 | 0 | 100ms | 100ms | 2026-05-18T06:03:34.931Z |

## Known Resources Considered

| Kind | Name | Path |
| --- | --- | --- |
| context | CLAUDE.md | CLAUDE.md |
| extension | agent-browser | ~/.pi/agent/extensions/agent-browser.ts |
| extension | context7 | ~/.pi/agent/extensions/context7.ts |
| extension | database | ~/.pi/agent/extensions/database.ts |
| extension | push | ~/.pi/agent/extensions/push.ts |
| extension | safeguard | ~/.pi/agent/extensions/safeguard.ts |
| extension | sftp | ~/.pi/agent/extensions/sftp.ts |
| extension | skill-extension-improver | ~/.pi/agent/extensions/skill-extension-improver.ts |
| extension | workflow-opportunity-scout | ~/.pi/agent/extensions/workflow-opportunity-scout.ts |
| skill | agent-browser | ~/.pi/agent/skills/agent-browser/SKILL.md |
| skill | bash-error-recovery-playbook | ~/.pi/agent/skills/bash-error-recovery-playbook/SKILL.md |
| skill | context7 | ~/.pi/agent/skills/context7/SKILL.md |
| skill | database | ~/.pi/agent/skills/database/SKILL.md |
| skill | gitnexus-cli | ~/.agents/skills/gitnexus-cli/SKILL.md |
| skill | gitnexus-debugging | ~/.agents/skills/gitnexus-debugging/SKILL.md |
| skill | gitnexus-exploring | ~/.agents/skills/gitnexus-exploring/SKILL.md |
| skill | gitnexus-guide | ~/.agents/skills/gitnexus-guide/SKILL.md |
| skill | gitnexus-impact-analysis | ~/.agents/skills/gitnexus-impact-analysis/SKILL.md |
| skill | gitnexus-pr-review | ~/.agents/skills/gitnexus-pr-review/SKILL.md |
| skill | gitnexus-refactoring | ~/.agents/skills/gitnexus-refactoring/SKILL.md |
| skill | nix-dotfiles-workflow | ~/.pi/agent/skills/nix-dotfiles-workflow/SKILL.md |
| skill | safeguard | ~/.pi/agent/skills/safeguard/SKILL.md |
| skill | sftp | ~/.pi/agent/skills/sftp/SKILL.md |

## Notes

- Prompt samples are redacted and clipped before storage.
- Suggestions are heuristic; accept only ideas that match your workflow.
- Tool-specific setup/failure fixes are intentionally left to Skill & Extension Improver; this scout favors broader global or project context opportunities.
- Accepted prompts queue an agent task; they do not edit files directly.
- Configure thresholds in `config.json` or with `/workflow-scout config`.
