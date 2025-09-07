vim.g.mapleader = " "
vim.g.maplocalleader = " "

vim.keymap.set("n", "gv", "<cmd>vs <cfile><cr>")
vim.keymap.set("n", "gx", "<cmd>split <cfile><cr>")

vim.keymap.set("n", "q", "<nop>")
vim.keymap.set("n", "Q", "<nop>")

vim.keymap.set("n", "<A-o>", function()
	vim.diagnostic.open_float({ border = { "┌", "─", "┐", "│", "┘", "─", "└", "│" } })
end)

vim.keymap.set("n", "<A-x>", "<cmd>vnew<cr>")

vim.keymap.set({ "n", "i" }, "<A-t>", function()
	vim.api.nvim_put({ os.date("%Y%m%d%H%M%S") .. ".md" }, "c", true, true)
end, { noremap = true, silent = true })

vim.keymap.set("n", "<leader>s", "<cmd>e personal/todo.md | vsplit personal/schedule.md | vsplit personal/habits.md<CR>", { noremap = true, silent = true })
