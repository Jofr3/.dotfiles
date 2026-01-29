# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal Neovim configuration using **lazy.nvim** as the plugin manager. The configuration prioritizes modern plugins (snacks.nvim, blink.cmp, rose-pine) with a modular file structure.

## Architecture

```
init.lua                    # Entry point - loads config modules in order
lua/
├── config/
│   ├── lazy.lua           # Plugin manager bootstrap and setup
│   ├── opts.lua           # Editor options (tabs, search, UI, etc.)
│   ├── maps.lua           # Global keybindings
│   └── cmds.lua           # Custom commands (GetFilePath, NewNote)
└── plugins/               # One file per plugin/feature
    ├── lsp.lua            # LSP servers: lua_ls, nil_ls, ts_ls, angularls, html, cssls, marksman
    ├── blink.lua          # Completion engine (replaces nvim-cmp)
    ├── picker.lua         # snacks.nvim picker (primary finder)
    ├── git.lua            # fugitive + gitsigns + mini.diff
    ├── theme.lua          # rose-pine (active), gruvbox (fallback)
    ├── smart-splits.lua   # Window navigation and resizing
    ├── sftp.lua           # SFTP sync for 11 project workspaces
    └── ...
snippets/                  # JSON snippets for javascript, lua, markdown, php
```

## Key Conventions

**Leader keys**: `<space>` (leader), `\` (localleader)

**Keybinding patterns**:
- `<A-*>` (Alt): Primary modifier for UI operations
- `g*`: LSP go-to commands (gd, gD, gt, gi, gr)
- `<leader>l*`: LSP operations (rename, action, format)
- `[*` / `]*`: Navigation (hunks, quickfix)

**Important keybindings**:
| Key | Action |
|-----|--------|
| `<A-f>` | File picker |
| `<A-b>` | Buffer picker |
| `<A-g>` | Grep picker |
| `<A-m>` | File explorer (snacks) |
| `<A-n>` | Oil file browser |
| `<A-u>` | Undo history |
| `<A-hjkl>` | Move between splits |
| `<A-HJKL>` | Resize splits |
| `<A-j/k>` | Completion navigation |
| `<Tab>` | Accept completion |

## Plugin States

Some plugins have disabled alternatives for fallback:
- **Active**: snacks.nvim picker, blink.cmp, rose-pine, mini.icons
- **Disabled**: telescope.nvim, gruvbox, nvim-web-devicons

To switch themes or pickers, toggle the `enabled` field in the respective plugin file.

## Custom Commands

- `GitBlame`, `GitLog`, `GitLogThis`, `GitLogLines`, `GitDiff` - Git operations
- `GitPreviewHunk`, `GitResetHunk`, `GitChanges` - Hunk management
- `GetFilePath` - Copy current file path to clipboard
- `NewNote` - Generate random markdown filename

## Adding New Plugins

Create a new file in `lua/plugins/` returning a lazy.nvim spec table:

```lua
return {
  "author/plugin-name",
  enabled = true,
  lazy = false,  -- or true for deferred loading
  opts = {},
  keys = {},
}
```

## SFTP Configuration

`lua/plugins/sftp.lua` contains mappings for 11 local workspaces to remote servers. Each entry maps a local path to remote host/path for file synchronization.
