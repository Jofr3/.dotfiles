return {
  "neovim/nvim-lspconfig",
  enabled = true,
  lazy = false,
  init = function ()
    vim.lsp.enable({ "lua_ls", "nil_ls", "ts_ls", "angularls", "html", "cssls" })
  end
}
