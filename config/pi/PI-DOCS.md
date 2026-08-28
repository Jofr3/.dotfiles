# Pi documentation map (local)

Where Pi's own documentation lives on this machine, and when to read it.

## When to use this file

Consult the local docs below **before answering or implementing** anything about Pi
itself — not from memory, and not from the web. Triggers:

- Questions about Pi behaviour: slash commands, sessions/`/tree`, compaction,
  settings, keybindings, themes, providers/models, auth, project trust, security.
- Writing or debugging a Pi **extension**, **skill**, **prompt template**, **theme**,
  or **Pi package** (anything under `agent/extensions/`, `agent/skills/`).
- Using Pi **programmatically**: SDK, RPC mode, JSON event-stream mode, TUI components.
- Anything about the **session file format** or on-disk layout.
- Platform/setup issues: terminal, tmux, Termux, Windows, containerization.

Read the relevant doc **completely** (plus its linked example) before implementing.
The docs are version-pinned to the installed Pi, so they beat any general knowledge.

## Root path

```
/etc/profiles/per-user/jofre/lib/node_modules/pi-monorepo
```

That is the stable Nix-profile symlink — prefer it. It currently resolves to
`/nix/store/…-pi-coding-agent-0.83.0/lib/node_modules/pi-monorepo` (read-only,
version-pinned; the store hash changes on every Pi upgrade, so never hardcode it).

Directory name is `pi-monorepo`; the package `name` is `@earendil-works/pi-coding-agent`.

Resolve it from scratch if the path above ever moves:

```sh
readlink -f "$(which pi)"          # -> /nix/store/<hash>-pi-coding-agent-<ver>/bin/pi
# docs are at <store-path>/lib/node_modules/pi-monorepo/docs
```

Shell helper: `PI=/etc/profiles/per-user/jofre/lib/node_modules/pi-monorepo`

## `$PI/docs/` — user-facing documentation (31 files)

`docs.json` holds the published navigation/redirects; `index.md` is the overview;
`images/` holds screenshots.

### Start here
| File | Covers |
| --- | --- |
| `index.md` | Doc overview / table of contents |
| `quickstart.md` | Install, authenticate, first session, project instructions |
| `usage.md` | Interactive mode, slash commands, message queue, context files, export/share |
| `providers.md` | Subscriptions, API keys, cloud providers, llama.cpp, custom providers |
| `security.md` | Project trust, **no built-in sandbox**, running untrusted work |
| `containerization.md` | Gondolin, plain Docker, OpenShell patterns |
| `settings.md` | Every setting, project overrides, project trust |
| `keybindings.md` | Key format, all actions, custom config |
| `sessions.md` | Session storage, resume/delete/name, branching `/tree` `/fork` `/clone` |
| `compaction.md` | Compaction and branch summarization, summary format |

### Customization
| File | Covers |
| --- | --- |
| `extensions.md` | **Primary extension reference** (~3k lines): locations, available imports, events, tools, commands, UI |
| `skills.md` | Skill locations, structure, commands, how they load |
| `prompt-templates.md` | Locations, format, arguments, loading rules |
| `themes.md` | Theme locations, format, color tokens |
| `packages.md` | Pi packages: install/manage, sources, authoring, structure, deps |
| `models.md` | Custom models, supported APIs, provider config |
| `custom-provider.md` | Registering/overriding/unregistering providers |
| `llama-cpp.md` | Local llama.cpp router setup (not in published nav) |
| `environment-variables.md` | Process marker, bash-tool session env, Pi process config (not in published nav) |

### Programmatic usage
| File | Covers |
| --- | --- |
| `sdk.md` | SDK options reference, ResourceLoader, core concepts |
| `rpc.md` | RPC protocol: commands, events, extension UI protocol, errors |
| `json.md` | JSON event-stream mode: event/message types, output format |
| `tui.md` | TUI components, focusable/IME, overlays, built-ins, keyboard input |

### Reference / platform / development
| File | Covers |
| --- | --- |
| `session-format.md` | On-disk session file format, message/entry types, file location, deletion |
| `terminal-setup.md` | Kitty, iTerm2, Apple Terminal, Ghostty, WezTerm, Alacritty, VS Code |
| `tmux.md` | Recommended config, `csi-u` rationale |
| `termux.md` | Android setup, clipboard, example AGENTS.md |
| `windows.md` | Custom shell path |
| `shell-aliases.md` | Alias snippets (13 lines) |
| `development.md` | Building Pi itself, forking/rebranding, path resolution, testing, project structure |

## `$PI/examples/` — runnable reference implementations

Read the example alongside the doc; `extensions.md` links to these by name.

- `examples/extensions/README.md` — index of ~70 single-file extensions.
- `examples/extensions/*.ts` — one pattern each: `tools.ts`, `dynamic-tools.ts`,
  `commands.ts`, `event-bus.ts`, `permission-gate.ts`, `confirm-destructive.ts`,
  `protected-paths.ts`, `project-trust.ts`, `custom-compaction.ts`,
  `structured-output.ts`, `status-line.ts`, `message-renderer.ts`,
  `entry-renderer.ts`, `tool-override.ts`, `input-transform.ts`, `question.ts`,
  `notify.ts`, `ssh.ts`, `handoff.ts`, `reload-runtime.ts`, …
- `examples/extensions/<dir>/` — multi-file examples: `subagent/`, `plan-mode/`,
  `sandbox/`, `gondolin/`, `dynamic-resources/`, `doom-overlay/`, `with-deps/`,
  `custom-provider-anthropic/`, `custom-provider-gitlab-duo/`.
- `examples/sdk/01-…13-*.ts` — numbered SDK walkthrough (minimal → custom model →
  prompts → skills → tools → extensions → context files → prompt templates →
  API keys/OAuth → settings → sessions → full control → session runtime).
- `examples/rpc-extension-ui.ts` — RPC extension-UI demo.

## Internals & type definitions

Use these when the prose docs stop short of the actual API surface.

| Path (under `$PI`) | Covers |
| --- | --- |
| `node_modules/@earendil-works/pi-agent-core/docs/` | Harness design notes: `agent-harness.md`, `harness.md`, `harness-v2.md`, `durable-harness.md`, `hooks.md`, `models.md`, `observability.md` |
| `dist/*.d.ts` | Public API of `@earendil-works/pi-coding-agent` (entry: `dist/index.d.ts`) |
| `node_modules/@earendil-works/pi-tui/dist/*.d.ts` | `@earendil-works/pi-tui` types (+ its `README.md`, `CHANGELOG.md`) |
| `node_modules/@earendil-works/pi-ai/dist/*.d.ts` | `@earendil-works/pi-ai` types (+ its `README.md`, `CHANGELOG.md`) |
| `node_modules/@earendil-works/pi-agent-core/dist/*.d.ts` | `agent.d.ts`, `agent-loop.d.ts`, `types.d.ts`, `stream-fn.d.ts`, `node.d.ts`, `proxy.d.ts` |
| `README.md`, `CHANGELOG.md` | Project overview and per-version changes — check `CHANGELOG.md` when behaviour differs from the docs |

## Search recipes

```sh
PI=/etc/profiles/per-user/jofre/lib/node_modules/pi-monorepo
rg -n "onToolCall" "$PI/docs" "$PI/examples"        # find an API across docs + examples
rg -l "compaction" "$PI/docs"                        # which docs mention a topic
sed -n '1,120p' "$PI/docs/extensions.md"             # read a section
rg -n "export (interface|type|declare)" "$PI/dist/index.d.ts"
```

Exclude `$PI/node_modules` from broad searches except the `@earendil-works/*`
packages listed above — the rest is third-party dependency noise.

## Caveats

- Everything under `$PI` is **read-only** (Nix store). Never try to edit or patch it.
- Pinned to Pi **0.83.0**. Re-derive the path after a Pi upgrade.
- The Pi source checkout referenced elsewhere (`~/projects/pi-mono`) is **not present**
  on this machine; the installed package above is the only local source of truth.
