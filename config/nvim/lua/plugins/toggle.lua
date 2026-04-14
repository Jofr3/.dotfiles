require("nvim-toggler").setup({
  inverses = {
    ["true"] = "false",
    ["enabled"] = "disabled",
    ["- [ ]"] = "- [X]",
    ["yes"] = "no",
    ["left"] = "right",
    ["top"] = "bottom",
    ["&&"] = "||",
    ["dd"] = "dump",
    ["asc"] = "desc",
    [">"] = "<",
    [">="] = "<=",
    ["=="] = "!=",
  },
  remove_default_keybinds = true,
  remove_default_inverses = true,
})

vim.keymap.set({ "n", "v" }, "<A-a>", "<cmd>lua require('nvim-toggler').toggle()<cr>")
