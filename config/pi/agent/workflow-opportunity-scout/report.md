# Workflow Opportunity Scout Report

Generated: 2026-05-15T12:57:12.905Z
CWD: `/home/jofre/.dotfiles`
Store: `/home/jofre/.pi/agent/workflow-opportunity-scout`

## Summary

- Active suggestions: 1
- Prompt patterns tracked: 3
- Repeated bash command patterns tracked: 9
- Tool sequences tracked: 1
- Tool problem patterns tracked: 1
- Known skills/extensions: 12 skills, 8 extensions

## Top Suggestions

### 📘 Reduce repeated bash error friction

- Kind: skill
- Suggested name: `bash-error-recovery-playbook`
- Confidence: 79% (7 signal(s), source: tool-problem)
- Target path: `/home/jofre/.pi/agent/skills/bash-error-recovery-playbook/SKILL.md`
- Why: The bash tool has had repeated error signals. A small playbook can teach the agent recovery steps and prevention tactics.
- Action: Create a skill with prevention and recovery instructions for bash error cases, including examples from recent failures and when to ask for clarification.
- Evidence:
  - rg: public: No such file or directory (os error 2) resources/views/solicituds/pdfSolicitud.blade.php:694: <p style="padding-bottom: 0px !important; margin-bottom: 0px !important;"><b>COMPACTACIÓ AJUT DE MENJADOR</b></p> resources/views/solicituds/pdfSolicitud.blade.php:699: <img…
  - rg: routes: No such file or directory (os error 2) rg: resources: No such file or directory (os error 2) app/synchronize/sync.php:30: $justificacions_transport = $_POST['transport']['justificacions']; app/synchronize/sync.php:31: $coordenades = $_POST['transport']['coordenades']…
  - Warning: include_once(../connexio.php): Failed to open stream: No such file or directory in /home/jofre/lsw/beques/auxiliars/get_ajudes_disponibles.php on line 7 Warning: include_once(): Failed opening '../connexio.php' for inclusion (include_path='.:/nix/store/m13fg5a8bfmzh5x6m…
  - Warning: require(vendor/autoload.php): Failed to open stream: No such file or directory in /home/jofre/lsw/beques/connexio.php on line 3 Fatal error: Uncaught Error: Failed opening required 'vendor/autoload.php' (include_path='.:/nix/store/m13fg5a8bfmzh5x6mch5g2r2n1b582iw-php-8.…
  - Warning: require(vendor/autoload.php): Failed to open stream: No such file or directory in /home/jofre/lsw/beques/connexio.php on line 3 Fatal error: Uncaught Error: Failed opening required 'vendor/autoload.php' (include_path='/home/jofre/lsw/beques:.') in /home/jofre/lsw/beques…
  - (no output) Command exited with code 1

## Prompt Pattern Signals

| Pattern | Kind | Count | Confidence | Proposed name | Last seen |
| --- | --- | ---: | ---: | --- | --- |
| NixOS/Home Manager dotfiles workflow | skill | 2 | 50% | `nix-dotfiles-workflow` | 2026-05-15T12:56:26.772Z |
| Release/commit automation workflow | extension | 2 | 47% | `release-ship-workflow` | 2026-05-15T12:56:26.772Z |
| Launcher scripts and JSON menu workflow | skill | 1 | 56% | `launcher-scripts-workflow` | 2026-05-15T12:18:35.652Z |

## Repeated Bash Command Signals

| Command pattern | Count | Errors | Avg | Max | Last seen |
| --- | ---: | ---: | ---: | ---: | --- |
| `cd ~/lsw/beques &&` | 7 | 2 | 40ms | 62ms | 2026-05-15T12:30:37.061Z |
| `cd ~/lsw/beques/auxiliars &&` | 2 | 2 | 51ms | 51ms | 2026-05-15T12:29:07.713Z |
| `curl -sSL 'https://dev-beques.ccosona.cat/auxiliars/get_ajudes_disponibles.php?id_municipi_alumne=45&id_curs_escolar=19&id_escola=62&id_nivell_curs=12&es_crae=0&from=2&escola_anterior=-1&id_alumne_r=100197'` | 2 | 0 | 200ms | 226ms | 2026-05-15T12:31:39.982Z |
| `cd /home/jofre/lsw/renovacions &&` | 1 | 0 | 78ms | 78ms | 2026-05-15T12:28:17.733Z |
| `curl -sS 'http://dev-beques.ccosona.cat/auxiliars/get_ajudes_disponibles.php?id_municipi_alumne=45&id_curs_escolar=19&id_escola=62&id_nivell_curs=12&es_crae=0&from=2&escola_anterior=-1&id_alumne_r=100197'` | 1 | 0 | 156ms | 156ms | 2026-05-15T12:30:07.455Z |
| `scp -i /home/jofre/.ssh/keys/jofre_key.pem` | 1 | 0 | 1.7s | 1.7s | 2026-05-15T12:31:34.666Z |
| `php -l /home/jofre/lsw/beques/funcions.utility.php` | 1 | 0 | 74ms | 74ms | 2026-05-15T12:31:55.468Z |
| `curl -sS -X` | 1 | 0 | 166ms | 166ms | 2026-05-15T12:32:02.033Z |
| `git add config/claude/.last-cleanup` | 1 | 0 | 28ms | 28ms | 2026-05-15T12:56:57.761Z |

## Known Resources Considered

| Kind | Name | Path |
| --- | --- | --- |
| extension | agent-browser | ~/.pi/agent/extensions/agent-browser.ts |
| extension | context7 | ~/.pi/agent/extensions/context7.ts |
| extension | database | ~/.pi/agent/extensions/database.ts |
| extension | push | ~/.pi/agent/extensions/push.ts |
| extension | safeguard | ~/.pi/agent/extensions/safeguard.ts |
| extension | sftp | ~/.pi/agent/extensions/sftp.ts |
| extension | skill-extension-improver | ~/.pi/agent/extensions/skill-extension-improver.ts |
| extension | workflow-opportunity-scout | ~/.pi/agent/extensions/workflow-opportunity-scout.ts |
| skill | agent-browser | ~/.pi/agent/skills/agent-browser/SKILL.md |
| skill | context7 | ~/.pi/agent/skills/context7/SKILL.md |
| skill | database | ~/.pi/agent/skills/database/SKILL.md |
| skill | gitnexus-cli | ~/.agents/skills/gitnexus-cli/SKILL.md |
| skill | gitnexus-debugging | ~/.agents/skills/gitnexus-debugging/SKILL.md |
| skill | gitnexus-exploring | ~/.agents/skills/gitnexus-exploring/SKILL.md |
| skill | gitnexus-guide | ~/.agents/skills/gitnexus-guide/SKILL.md |
| skill | gitnexus-impact-analysis | ~/.agents/skills/gitnexus-impact-analysis/SKILL.md |
| skill | gitnexus-pr-review | ~/.agents/skills/gitnexus-pr-review/SKILL.md |
| skill | gitnexus-refactoring | ~/.agents/skills/gitnexus-refactoring/SKILL.md |
| skill | safeguard | ~/.pi/agent/skills/safeguard/SKILL.md |
| skill | sftp | ~/.pi/agent/skills/sftp/SKILL.md |

## Notes

- Prompt samples are redacted and clipped before storage.
- Suggestions are heuristic; accept only ideas that match your workflow.
- Accepted prompts queue an agent task; they do not edit files directly.
- Configure thresholds in `config.json` or with `/workflow-scout config`.
