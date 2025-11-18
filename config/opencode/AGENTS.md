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
- Neovim operations: `/vim <operation>` (uses Neovim MCP)
- Chrome browser automation: `/chrome <operation>` (uses Chrome DevTools MCP)
- Database operations: `/db <operation>` (database schema, queries, migrations)

## Custom Agents
All agents use `mode: "subagent"` and can be invoked explicitly via commands or automatically via natural language:

### Documentation Agent (`docs`)
- **Purpose**: Search library documentation using Context7 MCP
- **Auto-invoked when**: User asks "how do I...", "what's the API for...", "look up docs"
- **Command**: `/docs <library> <topic>`
- **Examples**: 
  - `/docs next.js authentication`
  - "How do I use React hooks?"
  - "Look up the API for Express middleware"

### NixOS Agent (`nixos`)
- **Purpose**: Search NixOS options, packages, and configuration
- **Auto-invoked when**: User asks about NixOS configuration or packages
- **Command**: `/nixos <query>`
- **Examples**:
  - `/nixos services.postgresql`
  - "What's the NixOS option to enable firewall?"
  - "Search nixpkgs for the firefox package"

### Neovim Agent (`neovim`)
- **Purpose**: Text editing and navigation in Neovim via MCP
- **Auto-invoked when**: User says "open in neovim", "locate this code", "edit in vim"
- **Command**: `/vim <operation>`
- **Examples**:
  - `/vim search and replace 'oldText' with 'newText'`
  - "Open index.php in neovim"
  - "Locate this function in vim at line 100"

### Database Agent (`database`)
- **Purpose**: Database schema design, queries, and migrations
- **Auto-invoked when**: User asks to create migrations, write SQL, design schemas
- **Command**: `/db <operation>`
- **Examples**:
  - `/db create migration for users table`
  - "Write a SQL query to join orders and customers"
  - "Design a schema for a blog with posts and comments"

### Chrome Browser Agent (`chrome`)
- **Purpose**: Browser automation and testing via Chrome DevTools
- **Auto-invoked when**: User asks for browser automation, web scraping, or testing
- **Command**: `/chrome <operation>`
- **Examples**:
  - `/chrome navigate to example.com and take screenshot`
  - "Open this URL in chrome and click the login button"
  - "Automate filling out this form in the browser"

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
