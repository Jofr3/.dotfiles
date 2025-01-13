return {
  'nvim-treesitter/nvim-treesitter',
  enabled = true,
  lazy = false,
  config = function()
    require('nvim-treesitter').setup({
      ensure_installed = { "lua", "vim", "vimdoc", "query", "markdown", "markdown_inline", "json", "nix" },
      highlight = {
        enable = true
      }
    })
  end
}
