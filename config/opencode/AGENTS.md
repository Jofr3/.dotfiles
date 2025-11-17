# OpenCode Configuration Directory

## Overview
This is the OpenCode configuration directory (`~/.config/opencode`), not a development project.

## Structure
- `opencode.json` - Main configuration file (MCP servers, settings, agents, commands)
- `package.json` - Plugin dependencies only
- `agent/` - Custom agent definitions (markdown files)

## Commands
- Install/update plugins: `bun install` or `npm install`
- Search docs: `/docs <library> <topic>` (uses Context7 MCP)
- Search NixOS options/packages: `/nixos <query>` (uses mcp-nixos)

## Custom Agents
All agents use `mode: "auto"` and are automatically invoked when relevant:
- **docs** - Documentation search agent using Context7 MCP (auto-invoked)
  - Usage: Automatically invoked for documentation queries
  - Command: `/docs next.js authentication`
- **nixos** - NixOS options and packages search agent (auto-invoked)
  - Usage: Automatically invoked for NixOS-related queries
  - Command: `/nixos services.postgresql`

## Editing Guidelines
- **Config files**: Use JSON format with proper schema validation
- **opencode.json**: Follow the schema at https://opencode.ai/config.json
- **MCP configuration**: Add servers under `mcp` key with `type`, `url`, and optional `headers`
- **Agent files**: Use markdown with YAML frontmatter in `agent/` directory
- **Sensitive data**: API keys should be in environment variables, not committed to git

## File Operations
- Always validate JSON syntax before saving
- Preserve existing structure when adding new MCP servers
- Keep configuration minimal - only add what's needed

## No Build/Test/Lint
This directory has no build, test, or lint commands - it's configuration only.
