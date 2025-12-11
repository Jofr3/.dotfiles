# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the Claude Code configuration directory located at `/home/jofre/.dotfiles/config/claude`. It stores user preferences, session histories, plugin configurations, and project metadata for the Claude Code CLI tool.

## Key Configuration Files

### settings.json
Main configuration file controlling:
- **Status line**: Custom bash script at `/home/jofre/.claude/statusline.sh` displays `dirname (branch) - model_name`
- **MCP servers**: Upstash Context7 MCP server configuration
- **Always thinking mode**: Enabled by default (`alwaysThinkingEnabled: true`)

### settings.local.json
Local overrides for settings. Takes precedence over `settings.json`.

### statusline.sh
Bash script that generates the status line display. Receives JSON input via stdin containing workspace and model info. Outputs formatted string showing:
- Current directory name
- Git branch (if in git repo)
- Claude model name

Example output: `claude (main) - Claude Sonnet`

### plugins/mcp.json
MCP (Model Context Protocol) server configurations. Currently configured with:
- **context7**: Upstash Context7 server running via `bunx upstash/context7-mcp`

## Directory Structure

### Session Data
- **projects/**: Conversation histories for tracked projects. Directory names encode the project path (e.g., `-home-jofre--dotfiles-config-claude/` represents `/home/jofre/.dotfiles/config/claude`). Contains JSONL files with session transcripts.
- **debug/**: Debug logs from sessions, identified by UUID
- **todos/**: Task tracking data per session (JSON format)
- **session-env/**: Runtime session environment data
- **shell-snapshots/**: Captured shell command history during sessions

### Plugin System
- **plugins/installed_plugins.json**: v1 format plugin registry
- **plugins/installed_plugins_v2.json**: v2 format plugin registry (newer)
- **plugins/mcp.json**: MCP server definitions

### Analytics
- **statsig/**: Feature flag caching (Statsig platform)
- **telemetry/**: Usage data collection
- **history.jsonl**: Global command history in JSONL format

## Working with MCP Servers

MCP servers are defined in both `settings.json` and `plugins/mcp.json`. To add a new server, add an entry to `mcpServers`:

```json
"mcpServers": {
  "server-name": {
    "command": "executable",
    "args": ["arg1", "arg2"]
  }
}
```

The context7 server provides context management capabilities for conversations.

## Modifying Status Line

The status line script (`statusline.sh`) receives JSON via stdin with this structure:
```json
{
  "workspace": {
    "current_dir": "/path/to/directory"
  },
  "model": {
    "display_name": "Claude Sonnet"
  }
}
```

The script should output a single line string to be displayed in the CLI.

## Session Organization

Each Claude Code session generates:
1. A UUID session identifier
2. Conversation transcript in `projects/{encoded-path}/{session-id}.jsonl`
3. Debug log in `debug/{session-id}.txt`
4. Todo list in `todos/{session-id}-agent-{session-id}.json`
5. Shell snapshot in `shell-snapshots/snapshot-bash-{timestamp}-{short-id}.sh`
