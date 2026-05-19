# Workflow Opportunity Scout Report

Generated: 2026-05-19T19:58:52.983Z
CWD: `/home/jofre/projects/mult`
Store: `/home/jofre/.pi/agent/workflow-opportunity-scout`

## Summary

- Active suggestions: 13
- Prompt patterns tracked: 6
- Repeated bash command patterns tracked: 58
- Tool sequences tracked: 19
- Tool problem patterns tracked: 5
- Known resources: 7 skills, 8 extensions, 1 context files

## Top Suggestions

### 🧩 Automate repeated command: cargo test

- Kind: extension
- Suggested name: `cargo-test-command`
- Confidence: 88% (5 signal(s), source: bash-command)
- Target: `~/.pi/agent/extensions/cargo-test-command.ts`
- Why: The command pattern `cargo test` has appeared 5 time(s). Repeated shell commands are often better as Pi slash commands/tools with prompts, validation, status UI, and output truncation.
- Action: Create a Pi extension that exposes a slash command or tool for `cargo test`, validates inputs, runs the command safely, shows progress, and summarizes/truncates output. Average runtime observed: 2.3s.
- Evidence:
  - cargo test
  - cargo test && cargo clippy --all-targets --all-features -- -D warnings

### 🧩 Automate repeated command: just test

- Kind: extension
- Suggested name: `just-test-command`
- Confidence: 88% (5 signal(s), source: bash-command)
- Target: `~/.pi/agent/extensions/just-test-command.ts`
- Why: The command pattern `just test` has appeared 5 time(s). Repeated shell commands are often better as Pi slash commands/tools with prompts, validation, status UI, and output truncation.
- Action: Create a Pi extension that exposes a slash command or tool for `just test`, validates inputs, runs the command safely, shows progress, and summarizes/truncates output. Average runtime observed: 966ms.
- Evidence:
  - just test

### 🧩 Automate repeated command: cargo clippy --all-targets

- Kind: extension
- Suggested name: `cargo-clippy-all-targets-command`
- Confidence: 81% (4 signal(s), source: bash-command)
- Target: `~/.pi/agent/extensions/cargo-clippy-all-targets-command.ts`
- Why: The command pattern `cargo clippy --all-targets` has appeared 4 time(s). Repeated shell commands are often better as Pi slash commands/tools with prompts, validation, status UI, and output truncation.
- Action: Create a Pi extension that exposes a slash command or tool for `cargo clippy --all-targets`, validates inputs, runs the command safely, shows progress, and summarizes/truncates output. Average runtime observed: 3.5s.
- Evidence:
  - cargo clippy --all-targets --all-features -- -D warnings

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

### 🧩 Automate repeated command: git -C /home/jofre/.dotfiles

- Kind: extension
- Suggested name: `git-c-home-jofre-dotfiles-command`
- Confidence: 76% (4 signal(s), source: bash-command)
- Target: `~/.pi/agent/extensions/git-c-home-jofre-dotfiles-command.ts`
- Why: The command pattern `git -C /home/jofre/.dotfiles` has appeared 4 time(s). Repeated shell commands are often better as Pi slash commands/tools with prompts, validation, status UI, and output truncation.
- Action: Create a Pi extension that exposes a slash command or tool for `git -C /home/jofre/.dotfiles`, validates inputs, runs the command safely, shows progress, and summarizes/truncates output. Average runtime observed: 22ms.
- Evidence:
  - git -C /home/jofre/.dotfiles status --short -- config/pi/agent/skills/nix-dotfiles-workflow/SKILL.md
  - git -C /home/jofre/.dotfiles status --short -- config/pi/agent/extensions/agent-browser.ts
  - git -C /home/jofre/.dotfiles diff -- config/pi/agent/extensions/agent-browser.ts | sed -n '1,220p' && git -C /home/jofre/.dotfiles status --short -- config/pi/agent/extensions/agent-browser.ts
  - git -C /home/jofre/.dotfiles status --short && git -C /home/jofre/.dotfiles diff --stat -- config/nix/flake.lock

### 🧩 Automate repeated command: nix flake check

- Kind: extension
- Suggested name: `nix-flake-check-command`
- Confidence: 76% (4 signal(s), source: bash-command)
- Target: `~/.pi/agent/extensions/nix-flake-check-command.ts`
- Why: The command pattern `nix flake check` has appeared 4 time(s). Repeated shell commands are often better as Pi slash commands/tools with prompts, validation, status UI, and output truncation.
- Action: Create a Pi extension that exposes a slash command or tool for `nix flake check`, validates inputs, runs the command safely, shows progress, and summarizes/truncates output. Average runtime observed: 37.7s.
- Evidence:
  - nix flake check

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

### 🗺️ Document project runtime/dev-server context

- Kind: project context update
- Suggested name: `project-runtime-context`
- Confidence: 74% (2 signal(s), source: bash-command)
- Target: `AGENTS.md (or a project skill under .agents/skills/)`
- Why: Runtime/server friction (bun run dev) keeps appearing. This is usually not a new automation tool problem; it means Pi needs stable project context about how the app is normally run and when not to start another server.
- Action: Update AGENTS.md/CLAUDE.md or create a project skill with the normal dev-server owner (external terminal/container), URLs/ports, health-check commands, logs, when to start/stop servers, and validation/test commands.
- Evidence:
  - (bun run dev > /tmp/luminous-ui-vite.log 2>&1 & echo $!)
  - pgrep -af "vite --host 127.0.0.1 --port 5173|bun run dev" || true

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

## Prompt Pattern Signals

| Pattern | Kind | Count | Confidence | Proposed name | Last seen |
| --- | --- | ---: | ---: | --- | --- |
| NixOS/Home Manager dotfiles workflow | skill | 5 | 52% | `nix-dotfiles-workflow` | 2026-05-19T19:06:15.823Z |
| Release/commit automation workflow | extension | 4 | 47% | `release-ship-workflow` | 2026-05-19T10:23:43.979Z |
| Launcher scripts and JSON menu workflow | skill | 3 | 56% | `launcher-scripts-workflow` | 2026-05-19T14:19:09.291Z |
| Database inspection/change workflow | skill | 3 | 47% | `database-change-workflow` | 2026-05-18T10:53:46.201Z |
| Pi skill/extension authoring playbook | skill | 1 | 68% | `pi-skill-extension-authoring` | 2026-05-18T09:08:28.470Z |
| Project-specific debugging playbook | skill | 1 | 46% | `project-debugging-playbook` | 2026-05-18T09:08:28.471Z |

## Repeated Bash Command Signals

| Command pattern | Count | Errors | Avg | Max | Last seen |
| --- | ---: | ---: | ---: | ---: | --- |
| `cargo fmt` | 74 | 8 | 2.5s | 24.8s | 2026-05-19T18:38:15.310Z |
| `npm run` | 18 | 0 | 1.7s | 2.9s | 2026-05-18T07:55:54.956Z |
| `php -l app/Services/Usuari/TraspasService.php` | 17 | 0 | 152ms | 520ms | 2026-05-18T11:02:45.770Z |
| `bun run` | 16 | 1 | 1.9s | 2.7s | 2026-05-19T07:35:51.262Z |
| `just check &&` | 10 | 1 | 898ms | 5.0s | 2026-05-19T18:37:36.997Z |
| `cd ~/lsw/beques &&` | 7 | 2 | 40ms | 62ms | 2026-05-15T12:30:37.061Z |
| `just test` | 5 | 1 | 966ms | 1.3s | 2026-05-19T18:37:16.327Z |
| `cargo test` | 5 | 1 | 2.3s | 2.8s | 2026-05-19T17:25:34.262Z |
| `set -e` | 4 | 0 | 1.0s | 1.6s | 2026-05-18T06:11:51.506Z |
| `git -C /home/jofre/.dotfiles` | 4 | 0 | 22ms | 27ms | 2026-05-19T19:07:20.132Z |
| `nix flake check` | 4 | 0 | 37.7s | 82.6s | 2026-05-19T19:07:13.658Z |
| `cargo clippy --all-targets` | 4 | 1 | 3.5s | 10.6s | 2026-05-19T17:25:45.773Z |
| `just lint` | 4 | 1 | 1.7s | 2.8s | 2026-05-19T12:40:03.579Z |
| `bunx --bun @mariozechner/pi-coding-agent` | 3 | 0 | 3.2s | 7.0s | 2026-05-18T08:36:43.102Z |
| `timeout 8 script` | 3 | 0 | 7.1s | 10.0s | 2026-05-19T19:03:43.926Z |
| `cd ~/lsw/beques/auxiliars &&` | 2 | 2 | 51ms | 51ms | 2026-05-15T12:29:07.713Z |
| `curl -sSL 'https://dev-beques.ccosona.cat/auxiliars/get_ajudes_disponibles.php?id_municipi_alumne=45&id_curs_escolar=19&id_escola=62&id_nivell_curs=12&es_crae=0&from=2&escola_anterior=-1&id_alumne_r=100197'` | 2 | 0 | 200ms | 226ms | 2026-05-15T12:31:39.982Z |
| `python - <<'PY'` | 2 | 0 | 46ms | 55ms | 2026-05-18T07:24:56.750Z |
| `git commit` | 2 | 0 | 24ms | 27ms | 2026-05-15T13:01:25.668Z |
| `python3 - <<'PY'` | 2 | 0 | 278ms | 445ms | 2026-05-19T14:28:40.354Z |
| `pi --help |` | 2 | 0 | 738ms | 830ms | 2026-05-19T07:44:34.254Z |
| `tsc` | 2 | 2 | 810ms | 1.2s | 2026-05-18T08:57:20.381Z |
| `pwd && find` | 2 | 0 | 119ms | 215ms | 2026-05-18T10:32:19.496Z |
| `bun run dev` | 2 | 0 | 25ms | 27ms | 2026-05-19T05:55:08.529Z |
| `cargo check` | 2 | 0 | 4.9s | 9.4s | 2026-05-19T11:46:06.305Z |

## Known Resources Considered

| Kind | Name | Path |
| --- | --- | --- |
| context | AGENTS.md | AGENTS.md |
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
| skill | nix-dotfiles-workflow | ~/.pi/agent/skills/nix-dotfiles-workflow/SKILL.md |
| skill | safeguard | ~/.pi/agent/skills/safeguard/SKILL.md |
| skill | sftp | ~/.pi/agent/skills/sftp/SKILL.md |

## Notes

- Prompt samples are redacted and clipped before storage.
- Suggestions are heuristic; accept only ideas that match your workflow.
- Tool-specific setup/failure fixes are intentionally left to Skill & Extension Improver; this scout favors broader global or project context opportunities.
- Accepted prompts queue an agent task; they do not edit files directly.
- Configure thresholds in `config.json` or with `/workflow-scout config`.
