vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- vim.keymap.set("v", "<C-C>", "\"+y")
-- vim.keymap.set({ "n", "v" }, "<C-V>", "\"+p")
-- vim.keymap.set("i", "<C-V>", "<esc>\"+p")

-- vim.keymap.set("x", "<A-p>", "\"_dP")
-- vim.keymap.set({ "n", "v" }, "<A-d>", "\"_d")

vim.keymap.set("n", "q", "<nop>")
vim.keymap.set("n", "Q", "<nop>")

vim.keymap.set("n", "<D-o>", function()
	vim.diagnostic.open_float({ border = { "┌", "─", "┐", "│", "┘", "─", "└", "│" } })
end)
