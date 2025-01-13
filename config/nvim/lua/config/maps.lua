vim.g.mapleader = " "
vim.g.maplocalleader = " "

vim.keymap.set("v", "<C-C>", "\"+y")
vim.keymap.set({"n", "v"}, "<C-V>", "\"+p")
vim.keymap.set("i", "<C-V>", "<esc>\"+p")

vim.keymap.set("v", "<A-h>", "<gv")
vim.keymap.set("v", "<A-l>", ">gv")
vim.keymap.set("v", "<A-j>", ":m '>+1<CR>gv=gv", { silent = true })
vim.keymap.set("v", "<A-k>", ":m '<-2<CR>gv=gv", { silent = true })

vim.keymap.set("x", "<A-p>", "\"_dP")
vim.keymap.set({"n", "v"}, "<A-d>", "\"_d")

vim.keymap.set("n", "Q", "<nop>")

vim.keymap.set('t', '<esc>', "<C-\\><C-n>", { silent = true })
vim.keymap.set('n', '<A-t>', "<cmd>term<cr>", { silent = true })
