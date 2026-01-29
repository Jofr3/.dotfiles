vim.g.mapleader = " "
vim.g.maplocalleader = " "

vim.keymap.set("n", "q", "<nop>")
vim.keymap.set("n", "Q", "<nop>")

vim.keymap.set("n", "<A-v>", "<cmd>vnew<cr>")
vim.keymap.set("n", "<A-c>", "<cmd>new<cr>")


vim.keymap.set("n", "[q", "<cmd>cnext<cr>")
vim.keymap.set("n", "]q", "<cmd>cprev<cr>")
vim.keymap.set("n", "[Q", "<cmd>clast<cr>")
vim.keymap.set("n", "]Q", "<cmd>cfirst<cr>")
