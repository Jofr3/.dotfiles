require("dbee").setup({
  drawer = {
    disable_help = true,
    disable_candies = true,
    mappings = {
      { key = "<CR>", mode = "n", action = "toggle" },
    }
  },
  editor = {
    mappings = {
      { key = "<A-CR>", mode = "n", action = "run_under_cursor" },
    }
  },
  call_log = {
    disable_candies = true,
  },
  sources = {
    require("dbee.sources").EnvSource:new("DBEE_CONNECTIONS"),
  },
})

vim.keymap.set("n", "<A-r>", function() require("dbee").toggle() end, { desc = "Toggle Dbee" })
