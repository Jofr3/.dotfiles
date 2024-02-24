-- Better paste
vim.keymap.set("n", "<A-p>", '"0p')

-- Moving selected text up and down
vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv", { silent = true })
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv", { silent = true })

-- Moving selected text left and right
vim.keymap.set("v", "H", "<gv", { silent = true })
vim.keymap.set("v", "L", ">gv", { silent = true })

-- Scrolls up or down and centers screen
vim.keymap.set("n", "<C-d>", "<C-d>zz")
vim.keymap.set("n", "<C-u>", "<C-u>zz")

-- Centers screen on next or previous search
vim.keymap.set("n", "n", "nzzzv")
vim.keymap.set("n", "N", "Nzzzv")

-- Disable q and Q
vim.keymap.set("n", "q", "<nop>")
vim.keymap.set("n", "Q", "<nop>")

-- Remove search highlight
vim.keymap.set("n", "<Esc>", ":noh<CR>", { silent = true })

-- Turn on/off spell checking
-- vim.keymap.set('n', '<Leader>c', ':setlocal spell!<CR>', { silent = true })

-- Rename word under cursor && visual selection (buffer)
-- vim.keymap.set('n', '<A-r>', '<Esc> :%s/\\<<C-r><C-w>\\>//g<left><left>')
-- vim.cmd [[vnoremap <A-r> "hy:%s/<C-r>h//g<left><left>]]

-- Create new note
vim.keymap.set("n", "<leader>nn", ':exec  \'e \' . strftime("%Y%m%d%H%M") . ".md"<CR>', { silent = true })
