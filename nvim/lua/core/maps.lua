-- Moving selected text up and down
vim.keymap.set("v", "<A-j>", ":m '>+1<CR>gv=gv", { silent = true })
vim.keymap.set("v", "<A-k>", ":m '<-2<CR>gv=gv", { silent = true })

-- Moving selected text left and right
vim.keymap.set("v", "<A-h>", "<gv")
vim.keymap.set("v", "<A-l>", ">gv")

-- Scrolls up or down and centers screen
vim.keymap.set("n", "<C-d>", "<C-d>zz")
vim.keymap.set("n", "<C-u>", "<C-u>zz")

-- Centers screen on next or previous search
vim.keymap.set("n", "n", "nzzzv")
vim.keymap.set("n", "N", "Nzzzv")

-- Removes seatch highlight
vim.keymap.set("n", "<Esc>", "<cmd>nohlsearch<CR>")

-- Diagnostic keymaps
vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, { desc = "Go to previous [D]iagnostic message" })
vim.keymap.set("n", "]d", vim.diagnostic.goto_next, { desc = "Go to next [D]iagnostic message" })
vim.keymap.set("n", "<leader>e", vim.diagnostic.open_float, { desc = "Show diagnostic [E]rror messages" })
vim.keymap.set("n", "<leader>q", vim.diagnostic.setloclist, { desc = "Open diagnostic [Q]uickfix list" })

-- Disable arrow keys in normal mode
vim.keymap.set("n", "<left>", '<cmd>echo "Use h to move!!"<CR>')
vim.keymap.set("n", "<right>", '<cmd>echo "Use l to move!!"<CR>')
vim.keymap.set("n", "<up>", '<cmd>echo "Use k to move!!"<CR>')
vim.keymap.set("n", "<down>", '<cmd>echo "Use j to move!!"<CR>')

-- Disable arrow keys in insert mode
vim.keymap.set("i", "<left>", '<cmd>echo "Use h to move!!"<CR>')
vim.keymap.set("i", "<right>", '<cmd>echo "Use l to move!!"<CR>')
vim.keymap.set("i", "<up>", '<cmd>echo "Use k to move!!"<CR>')
vim.keymap.set("i", "<down>", '<cmd>echo "Use j to move!!"<CR>')

-- Move window focus
vim.keymap.set("n", "<A-h>", "<C-w><C-h>", { desc = "Move focus to the left window" })
vim.keymap.set("n", "<A-l>", "<C-w><C-l>", { desc = "Move focus to the right window" })
vim.keymap.set("n", "<A-j>", "<C-w><C-j>", { desc = "Move focus to the lower window" })
vim.keymap.set("n", "<A-k>", "<C-w><C-k>", { desc = "Move focus to the upper window" })

-- Resizing windows
vim.keymap.set("n", "<A-H>", "<cmd>vertical resize +5<CR>", { desc = "Resizing the window horizontally" })
vim.keymap.set("n", "<A-L>", "<cmd>vertical resize -5<CR>", { desc = "Resizing the window horizontally" })
vim.keymap.set("n", "<A-J>", "<cmd>resize -2<CR>", { desc = "Resizing the window horizontally" })
vim.keymap.set("n", "<A-K>", "<cmd>resize +2<CR>", { desc = "Resizing the window horizontally" })

-- Quickfix list navigation
vim.keymap.set("n", "q", "<cmd>cclose<CR>", { desc = "Close quickfix list" })
vim.keymap.set("n", "<C-j>", "<cmd>cnext<CR>", { desc = "Navigate to next item in quickfix list" })
vim.keymap.set("n", "<C-k>", "<cmd>cprev<CR>", { desc = "Navigate to prev item in quickfix list" })
