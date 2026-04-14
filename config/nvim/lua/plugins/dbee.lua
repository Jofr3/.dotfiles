require("dbee").setup({
  drawer = {
    disable_help = true,
    disable_candies = true,
  },
  call_log = {
    disable_candies = true,
  },
  sources = {
    require("dbee.sources").EnvSource:new("DBEE_CONNECTIONS"),
  },
})

vim.keymap.set("n", "<A-r>", function() require("dbee").toggle() end, { desc = "Toggle Dbee" })
