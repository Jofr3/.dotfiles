require("smart-splits").setup({
  default_amount = 7,
})

local map = vim.keymap.set
local modes = { "n", "t" }

map(modes, "<A-h>", "<cmd>lua require('smart-splits').move_cursor_left()<cr>")
map(modes, "<A-j>", "<cmd>lua require('smart-splits').move_cursor_down()<cr>")
map(modes, "<A-k>", "<cmd>lua require('smart-splits').move_cursor_up()<cr>")
map(modes, "<A-l>", "<cmd>lua require('smart-splits').move_cursor_right()<cr>")

map(modes, "<A-H>", "<cmd>lua require('smart-splits').resize_left()<cr>")
map(modes, "<A-J>", "<cmd>lua require('smart-splits').resize_down()<cr>")
map(modes, "<A-K>", "<cmd>lua require('smart-splits').resize_up()<cr>")
map(modes, "<A-L>", "<cmd>lua require('smart-splits').resize_right()<cr>")

map(modes, "<A-C-h>", "<cmd>lua require('smart-splits').swap_buf_left()<cr>")
map(modes, "<A-C-j>", "<cmd>lua require('smart-splits').swap_buf_down()<cr>")
map(modes, "<A-C-k>", "<cmd>lua require('smart-splits').swap_buf_up()<cr>")
map(modes, "<A-C-l>", "<cmd>lua require('smart-splits').swap_buf_right()<cr>")
