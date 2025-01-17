return {
  'nvim-treesitter/nvim-treesitter',
  enabled = true,
  -- lazy = false,
  opts = {
    ensure_installed = { "lua", "vim", "vimdoc", "query", "markdown", "markdown_inline", "json", "nix", "fish" },
    sync_install = true,
    highlight = {
      enable = true
    }
  }
}
