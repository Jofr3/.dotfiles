local parsers = {
  "lua",
  "nix",
  "javascript",
  "typescript",
  "tsx",
  "html",
  "css",
  "json",
  "markdown",
  "markdown_inline",
  "bash",
  "vim",
  "vimdoc",
  "query",
}

require("nvim-treesitter").install(parsers)

vim.api.nvim_create_autocmd("FileType", {
  callback = function(args)
    pcall(vim.treesitter.start, args.buf)
    pcall(function()
      vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
    end)
  end,
})
