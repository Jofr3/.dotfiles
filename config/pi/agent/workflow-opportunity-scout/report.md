# Workflow Opportunity Scout Report

Generated: 2026-05-18T11:14:31.726Z
CWD: `/home/jofre/lsw/renovacions`
Store: `/home/jofre/.pi/agent/workflow-opportunity-scout`

## Summary

- Active suggestions: 0
- Prompt patterns tracked: 6
- Repeated bash command patterns tracked: 36
- Tool sequences tracked: 10
- Tool problem patterns tracked: 5
- Known resources: 14 skills, 8 extensions, 1 context files

## Top Suggestions

No ready suggestions yet. Keep working; suggestions appear after repeated signals cross configured thresholds.
## Prompt Pattern Signals

| Pattern | Kind | Count | Confidence | Proposed name | Last seen |
| --- | --- | ---: | ---: | --- | --- |
| NixOS/Home Manager dotfiles workflow | skill | 4 | 50% | `nix-dotfiles-workflow` | 2026-05-18T09:08:28.470Z |
| Release/commit automation workflow | extension | 3 | 47% | `release-ship-workflow` | 2026-05-15T13:00:03.133Z |
| Database inspection/change workflow | skill | 3 | 47% | `database-change-workflow` | 2026-05-18T10:53:46.201Z |
| Launcher scripts and JSON menu workflow | skill | 2 | 56% | `launcher-scripts-workflow` | 2026-05-18T10:13:06.259Z |
| Pi skill/extension authoring playbook | skill | 1 | 68% | `pi-skill-extension-authoring` | 2026-05-18T09:08:28.470Z |
| Project-specific debugging playbook | skill | 1 | 46% | `project-debugging-playbook` | 2026-05-18T09:08:28.471Z |

## Repeated Bash Command Signals

| Command pattern | Count | Errors | Avg | Max | Last seen |
| --- | ---: | ---: | ---: | ---: | --- |
| `npm run` | 18 | 0 | 1.7s | 2.9s | 2026-05-18T07:55:54.956Z |
| `php -l app/Services/Usuari/TraspasService.php` | 16 | 0 | 155ms | 520ms | 2026-05-18T10:54:39.947Z |
| `cd ~/lsw/beques &&` | 7 | 2 | 40ms | 62ms | 2026-05-15T12:30:37.061Z |
| `set -e` | 4 | 0 | 1.0s | 1.6s | 2026-05-18T06:11:51.506Z |
| `git -C /home/jofre/.dotfiles` | 3 | 0 | 23ms | 27ms | 2026-05-18T08:37:07.479Z |
| `bunx --bun @mariozechner/pi-coding-agent` | 3 | 0 | 3.2s | 7.0s | 2026-05-18T08:36:43.102Z |
| `cd ~/lsw/beques/auxiliars &&` | 2 | 2 | 51ms | 51ms | 2026-05-15T12:29:07.713Z |
| `curl -sSL 'https://dev-beques.ccosona.cat/auxiliars/get_ajudes_disponibles.php?id_municipi_alumne=45&id_curs_escolar=19&id_escola=62&id_nivell_curs=12&es_crae=0&from=2&escola_anterior=-1&id_alumne_r=100197'` | 2 | 0 | 200ms | 226ms | 2026-05-15T12:31:39.982Z |
| `python - <<'PY'` | 2 | 0 | 46ms | 55ms | 2026-05-18T07:24:56.750Z |
| `git commit` | 2 | 0 | 24ms | 27ms | 2026-05-15T13:01:25.668Z |
| `pwd && ls` | 2 | 0 | 178ms | 298ms | 2026-05-18T11:02:53.095Z |
| `bun run` | 2 | 0 | 2.5s | 2.7s | 2026-05-18T08:59:25.754Z |
| `tsc` | 2 | 2 | 810ms | 1.2s | 2026-05-18T08:57:20.381Z |
| `pwd && find` | 2 | 0 | 119ms | 215ms | 2026-05-18T10:32:19.496Z |
| `php -l resources/views/iniciRenovacio.blade.php` | 2 | 1 | 61ms | 69ms | 2026-05-18T11:03:43.880Z |
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
