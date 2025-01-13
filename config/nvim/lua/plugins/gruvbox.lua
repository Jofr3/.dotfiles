return {
  "ellisonleao/gruvbox.nvim",
  enabled = true,
  lazy = false,
  priority = 1001,
  config = function()
    vim.opt.background = "dark"
    vim.cmd("colorscheme gruvbox")
  end
}
