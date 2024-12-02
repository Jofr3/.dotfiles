vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- Moving selected text up and down
vim.keymap.set("v", "<A-j>", ":m '>+1<CR>gv=gv", { silent = true })
vim.keymap.set("v", "<A-k>", ":m '<-2<CR>gv=gv", { silent = true })

-- Moving selected text left and right
vim.keymap.set("v", "<A-h>", "<gv")
vim.keymap.set("v", "<A-l>", ">gv")

-- make map for "save all and quit"
-- make map for "quit all no save"
