---
name: zellij
description: >
  Manage Zellij terminal sessions, panes, tabs, layouts, and plugins via the
  zellij-mcp-server. Use this skill whenever the user works with Zellij terminal
  multiplexer -- whether they're managing sessions, creating panes, organizing
  tabs, applying layouts, launching plugins, piping data between panes, or
  running commands in terminal panes. Trigger proactively when the context
  involves Zellij workspace management, terminal session orchestration, or
  multi-pane development workflows. Even if the user doesn't say "zellij", if
  the task involves managing terminal panes, sessions, or layouts, use this
  skill.
user_invocable: true
---

# Zellij MCP Skill

Manage Zellij terminal workspaces through 80 MCP tools spanning sessions, panes,
tabs, layouts, plugins, piping, and process monitoring. All tools are prefixed
with `mcp__zellij__zellij_`.

**Prerequisite:** Zellij must be installed and running. The MCP server
communicates with Zellij via CLI commands.

## Tool Categories

### 1. Session Management

| Tool | Key Parameters | Description |
|---|---|---|
| `zellij_list_sessions` | -- | List all active sessions |
| `zellij_new_session` | `session_name`, `layout?` | Create a new session |
| `zellij_attach_session` | `session_name` | Attach to a session |
| `zellij_switch_session` | `session_name` | Switch to a different session |
| `zellij_get_session_info` | `session_name` | Get detailed session info |
| `zellij_rename_session` | `old_name`, `new_name` | Rename a session |
| `zellij_clone_session` | `source_session`, `new_session_name` | Clone a session |
| `zellij_export_session` | `session_name`, `output_path?` | Export session config to JSON |
| `zellij_import_session` | `import_path`, `new_session_name?` | Import session from JSON |
| `zellij_kill_session` | `session_name` | Kill a session |
| `zellij_delete_session` | `session_name` | Delete a session |
| `zellij_kill_all_sessions` | -- | Kill all sessions |
| `zellij_delete_all_sessions` | -- | Delete all sessions |

```python
# List sessions
mcp__zellij__zellij_list_sessions()

# Create a new session with a layout
mcp__zellij__zellij_new_session(session_name="dev", layout="default")

# Get session details
mcp__zellij__zellij_get_session_info(session_name="dev")
```

### 2. Pane Operations

| Tool | Key Parameters | Description |
|---|---|---|
| `zellij_new_pane` | `direction?` (right/down), `command?`, `cwd?` | Create a new pane |
| `zellij_close_pane` | -- | Close focused pane |
| `zellij_focus_pane` | `direction` (left/right/up/down/next/previous) | Focus a pane |
| `zellij_move_focus_or_tab` | `direction` (left/right/up/down) | Move focus to pane or tab at edge |
| `zellij_swap_panes` | `direction` (left/right/up/down) | Swap pane position |
| `zellij_stack_panes` | `pane_ids` (string[]) | Stack panes together |
| `zellij_resize_pane` | `direction`, `amount` (increase/decrease) | Resize focused pane |
| `zellij_rename_pane` | `name` | Rename focused pane |
| `zellij_undo_rename_pane` | -- | Reset pane name |
| `zellij_toggle_floating` | -- | Toggle floating panes |
| `zellij_toggle_fullscreen` | -- | Toggle fullscreen |
| `zellij_toggle_pane_embed_float` | -- | Toggle embed/float |
| `zellij_pin_pane` | -- | Pin/unpin floating pane |
| `zellij_toggle_frames` | -- | Toggle pane frames |
| `zellij_clear_pane` | -- | Clear pane buffer |
| `zellij_dump_screen` | `output_path?` | Dump pane screen content |
| `zellij_edit_scrollback` | -- | Edit scrollback in editor |
| `zellij_scroll` | `direction` (up/down), `amount?` (line/half-page/page) | Scroll in pane |
| `zellij_scroll_to_edge` | `edge` (top/bottom) | Scroll to top/bottom |
| `zellij_exec_in_pane` | `command` | Execute command in pane |
| `zellij_write_to_pane` | `text`, `submit?` | Write text to pane |
| `zellij_get_pane_info` | -- | Get pane layout info |
| `zellij_change_floating_coordinates` | `x`, `y`, `width?`, `height?` | Reposition floating pane |

```python
# Create a pane running a dev server
mcp__zellij__zellij_new_pane(direction="down", command="bun run dev")

# Focus the pane to the right
mcp__zellij__zellij_focus_pane(direction="right")

# Execute a command in the current pane
mcp__zellij__zellij_exec_in_pane(command="git status")

# Write text to pane (optionally press enter)
mcp__zellij__zellij_write_to_pane(text="echo hello", submit=True)
```

### 3. Tab Management

| Tool | Key Parameters | Description |
|---|---|---|
| `zellij_new_tab` | `name?`, `layout?` | Create a new tab |
| `zellij_close_tab` | -- | Close current tab |
| `zellij_rename_tab` | `name` | Rename current tab |
| `zellij_undo_rename_tab` | -- | Reset tab name |
| `zellij_go_to_tab` | `index` | Go to tab by index |
| `zellij_go_to_tab_name` | `name` | Go to tab by name |
| `zellij_go_to_next_tab` | -- | Switch to next tab |
| `zellij_go_to_previous_tab` | -- | Switch to previous tab |
| `zellij_move_tab` | `direction` (left/right) | Move tab position |
| `zellij_query_tab_names` | -- | List all tab names |
| `zellij_toggle_sync_tab` | -- | Toggle synchronized input across panes |

```python
# Create a named tab
mcp__zellij__zellij_new_tab(name="tests", layout="default")

# Switch to a tab by name
mcp__zellij__zellij_go_to_tab_name(name="tests")

# List all tabs
mcp__zellij__zellij_query_tab_names()
```

### 4. Plugin Management

| Tool | Key Parameters | Description |
|---|---|---|
| `zellij_launch_plugin` | `plugin_url`, `configuration?`, `floating?`, `in_place?`, `skip_cache?`, `width?`, `height?`, `x?`, `y?`, `pinned?` | Launch a plugin with full options |
| `zellij_action_launch_plugin` | `plugin_url`, `configuration?`, `floating?`, `in_place?`, `skip_cache?` | Launch plugin via action command |
| `zellij_launch_or_focus_plugin` | `plugin_url`, `configuration?` | Launch or focus existing plugin |
| `zellij_start_or_reload_plugin` | `plugin_url`, `configuration?` | Start or reload a plugin |
| `zellij_list_aliases` | -- | List plugin aliases |
| `zellij_get_plugin_info` | `plugin_url` | Get plugin info |
| `zellij_list_running_plugins` | -- | List running plugins |

```python
# Launch a floating plugin
mcp__zellij__zellij_launch_plugin(plugin_url="filepicker", floating=True)

# Smart launch (focus if already running)
mcp__zellij__zellij_launch_or_focus_plugin(plugin_url="session-manager")
```

### 5. Layout Management

| Tool | Key Parameters | Description |
|---|---|---|
| `zellij_dump_layout` | `output_path?` | Dump current layout |
| `zellij_save_layout` | `layout_name`, `layouts_dir?` | Save current layout |
| `zellij_apply_layout` | `layout_name`, `session_name?` | Apply a layout |
| `zellij_list_layouts` | `layouts_dir?` | List available layouts |
| `zellij_load_layout` | `layout_name`, `layouts_dir?` | Load and display layout content |
| `zellij_new_tab_with_layout` | `layout_name`, `tab_name?` | Create tab with layout |
| `zellij_validate_layout` | `layout_path` | Validate layout file syntax |

```python
# Save current workspace layout
mcp__zellij__zellij_save_layout(layout_name="my-dev-setup")

# Apply a saved layout
mcp__zellij__zellij_apply_layout(layout_name="my-dev-setup")

# List available layouts
mcp__zellij__zellij_list_layouts()
```

### 6. Piping System

| Tool | Key Parameters | Description |
|---|---|---|
| `zellij_pipe` | `payload`, `pipe_name?`, `plugin_url?`, `args?`, `configuration?` | Send data to plugins via pipe |
| `zellij_pipe_to_plugin` | `payload`, `plugin_url`, `pipe_name?`, `configuration?` | Send data to specific plugin |
| `zellij_pipe_broadcast` | `payload`, `pipe_name` | Broadcast to all listening plugins |
| `zellij_action_pipe` | `payload`, `pipe_name?`, `plugin_url?`, `force_launch?`, `skip_cache?`, `floating?`, `in_place?`, `cwd?`, `title?` | Advanced piping with action options |
| `zellij_pipe_with_response` | `payload`, `pipe_name?`, `plugin_url?` | Send data and capture response |
| `zellij_pipe_from_file` | `file_path`, `pipe_name?`, `plugin_url?` | Pipe file content to plugins |

```python
# Pipe data to a plugin
mcp__zellij__zellij_pipe_to_plugin(payload="hello", plugin_url="my-plugin")

# Pipe file content
mcp__zellij__zellij_pipe_from_file(file_path="/tmp/data.json", plugin_url="processor")
```

### 7. LLM Completion Detection

| Tool | Key Parameters | Description |
|---|---|---|
| `zellij_watch_pipe` | `pipe_path`, `patterns?`, `timeout_ms?` | Watch pipe for patterns or EOF |
| `zellij_create_named_pipe` | `pipe_name`, `mode?` | Create named pipe for bidirectional comms |
| `zellij_pipe_with_timeout` | `command`, `target_pipe`, `timeout_ms?` | Pipe command output with timeout |
| `zellij_poll_process` | `pid`, `interval_ms?` | Poll process status by PID |
| `zellij_watch_file` | `file_path`, `patterns?`, `timeout_ms?` | Watch file for changes |
| `zellij_create_llm_wrapper` | `wrapper_name`, `llm_command`, `detect_marker?`, `timeout_ms?` | Create LLM completion detector wrapper |
| `zellij_cleanup_detection` | -- | Clean up detection resources |

```python
# Watch for command completion
mcp__zellij__zellij_watch_file(file_path="/tmp/output.log", patterns=["DONE", "ERROR"], timeout_ms=30000)

# Poll a running process
mcp__zellij__zellij_poll_process(pid="12345", interval_ms=1000)
```

### 8. System and Utility

| Tool | Key Parameters | Description |
|---|---|---|
| `zellij_run_command` | `command`, `direction?` (right/down) | Run command in new pane |
| `zellij_edit_file` | `file_path` | Edit file in new pane |
| `zellij_switch_mode` | `mode` (locked/pane/tab/resize/move/search/session) | Switch input mode |
| `zellij_clear_cache` | -- | Clear MCP server cache |
| `zellij_get_cache_stats` | -- | Get cache statistics |
| `zellij_health_check` | -- | System health check |

```python
# Run a command in a new pane to the right
mcp__zellij__zellij_run_command(command="htop", direction="right")

# Edit a file in a new pane
mcp__zellij__zellij_edit_file(file_path="src/index.ts")

# Health check
mcp__zellij__zellij_health_check()
```

## Workflows

### Set up a development workspace
1. Create or attach to a session: `zellij_new_session` or `zellij_attach_session`
2. Create tabs for different concerns: `zellij_new_tab`
3. Split panes within tabs: `zellij_new_pane`
4. Run dev servers and watchers: `zellij_exec_in_pane` or `zellij_run_command`
5. Save the layout for reuse: `zellij_save_layout`

### Monitor long-running processes
1. Run the command in a pane: `zellij_run_command`
2. Watch for completion: `zellij_watch_file` or `zellij_poll_process`
3. Dump output when done: `zellij_dump_screen`

### Organize workspace
1. Query existing tabs: `zellij_query_tab_names`
2. Rename tabs for clarity: `zellij_rename_tab`
3. Rearrange panes: `zellij_swap_panes`, `zellij_resize_pane`
4. Toggle floating panes for quick reference: `zellij_toggle_floating`

## When $ARGUMENTS is provided

If the user invokes this skill with arguments (e.g. `/zellij list sessions`),
interpret the argument as a command and execute the most relevant tool. Common
shortcuts:

- `list` / `ls` -- list sessions
- `new <name>` -- create a new session
- `pane <direction>` -- create a new pane
- `tab <name>` -- create a new tab
- `layout <name>` -- apply a layout
- `health` -- run health check

## Tips

- Use `zellij_get_pane_info` to understand the current workspace layout before
  making changes
- Use `zellij_dump_screen` to capture terminal output for analysis
- Use `zellij_write_to_pane` with `submit=True` to send commands to panes
- Save frequently-used layouts with `zellij_save_layout` for quick setup
- Use `zellij_launch_or_focus_plugin` instead of `zellij_launch_plugin` to
  avoid duplicate plugin instances
- The `zellij_toggle_sync_tab` tool is useful for running the same command
  across multiple panes simultaneously
- Use `zellij_clone_session` to create a copy of a working setup for
  experimentation
