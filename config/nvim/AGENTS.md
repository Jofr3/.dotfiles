# Agent Guidelines for Neovim Configuration

## Testing/Validation
- **Reload config**: Restart Neovim or `:source $MYVIMRC`
- **Check plugin health**: `:checkhealth` or `:checkhealth <plugin>`
- **Lazy plugin manager**: `:Lazy` to view/update plugins
- **Format code**: `<A-;>` or `:lua require('conform').format()`

## Code Style
- **Formatting**: 2-space indentation (tabs), match existing style in opts.lua:26-29
- **Plugin structure**: Return table with keys: `enabled`, `lazy`, `opts`, `config`, `keys`, `dependencies`
- **Keymaps**: Use `vim.keymap.set()` with descriptive mode strings, prefer `<A-key>` (Alt) bindings
- **Options**: Set via `vim.opt.option = value`, group related settings together
- **Functions**: Use anonymous functions for callbacks, prefer `function() ... end` over arrow syntax
- **Comments**: Minimal, use `--` for single line, `--[[ ]]` for blocks

## Plugin Conventions
- **Lazy loading**: Set `lazy = true` unless needed at startup, use `keys` for lazy-loaded keybinds
- **LSP servers**: Enable in lsp.lua:6 via `vim.lsp.enable()` array
- **Formatters**: Add to conform.lua:6 `formatters_by_ft` table
- **Highlight overrides**: Set in theme plugin (gruvbox.lua) via `vim.api.nvim_set_hl()`

## File Organization
- **Core config**: init.lua loads opts→lazy→maps→cmds in sequence
- **Plugins**: One file per plugin in `lua/plugins/`, auto-imported by lazy.nvim
- **Snippets**: JSON format in `snippets/`, named by filetype
