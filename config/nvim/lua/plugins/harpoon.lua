return {
  "ThePrimeagen/harpoon",
  enabled = true,
  lazy = false,
  dependencies = { "nvim-lua/plenary.nvim" },
  config = function()
    require("harpoon").setup {
      global_settings = {

        save_on_toggle = true,
        save_on_change = true,

        excluded_filetypes = { "harpoon", "oil" },
      }
    }
  end,
  keys = {
    { mode = "n", "<A-s>", "<cmd>lua require('harpoon.mark').add_file()<cr>" },
    { mode = "n", "<A-d>", "<cmd>lua require('harpoon.ui').toggle_quick_menu()<cr>" },
    { mode = "n", "<A-1>", "<cmd>lua require('harpoon.ui').nav_file(1)<cr>" },
    { mode = "n", "<A-2>", "<cmd>lua require('harpoon.ui').nav_file(2)<cr>" },
    { mode = "n", "<A-3>", "<cmd>lua require('harpoon.ui').nav_file(3)<cr>" },
    { mode = "n", "<A-4>", "<cmd>lua require('harpoon.ui').nav_file(4)<cr>" },
    { mode = "n", "<A-5>", "<cmd>lua require('harpoon.ui').nav_file(5)<cr>" },
    { mode = "n", "<A-6>", "<cmd>lua require('harpoon.ui').nav_file(6)<cr>" },
    { mode = "n", "<A-7>", "<cmd>lua require('harpoon.ui').nav_file(7)<cr>" },
    { mode = "n", "<A-8>", "<cmd>lua require('harpoon.ui').nav_file(8)<cr>" },
    { mode = "n", "<A-9>", "<cmd>lua require('harpoon.ui').nav_file(9)<cr>" },
  }
}
