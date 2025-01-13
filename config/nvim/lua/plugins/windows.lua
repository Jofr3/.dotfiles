return {
  "anuvyklack/windows.nvim",
  enabled = true,
  lazy = false,
  dependencies = { "anuvyklack/middleclass" },
  opts = {
    autowidth = {
      enable = false
    },
  },
  keys = {
    { mode = "n", "<A-m>", "<cmd>WindowsMaximize<cr>" },
  },
}
