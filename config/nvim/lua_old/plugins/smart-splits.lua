return { 
    'mrjones2014/smart-splits.nvim',
    keys = {
-- vim.keymap.set('n', '<A-h>', require('smart-splits').resize_left)
-- vim.keymap.set('n', '<A-j>', require('smart-splits').resize_down)
-- vim.keymap.set('n', '<A-k>', require('smart-splits').resize_up)
-- vim.keymap.set('n', '<A-l>', require('smart-splits').resize_right)
-- -- moving between splits
-- vim.keymap.set('n', '<C-h>', require('smart-splits').move_cursor_left)
-- vim.keymap.set('n', '<C-j>', require('smart-splits').move_cursor_down)
-- vim.keymap.set('n', '<C-k>', require('smart-splits').move_cursor_up)
-- vim.keymap.set('n', '<C-l>', require('smart-splits').move_cursor_right)
-- vim.keymap.set('n', '<C-\\>', require('smart-splits').move_cursor_previous)
-- -- swapping buffers between windows
-- vim.keymap.set('n', '<leader><leader>h', require('smart-splits').swap_buf_left)
-- vim.keymap.set('n', '<leader><leader>j', require('smart-splits').swap_buf_down)
-- vim.keymap.set('n', '<leader><leader>k', require('smart-splits').swap_buf_up)
-- vim.keymap.set('n', '<leader><leader>l', require('smart-splits').swap_buf_right)

		{ "<A-h>", "<cmd>:lua require('smart-splits').move_cursor_left()<cr>", remap = true, desc = "Move cursor left" },
		{ "<A-j>", "<cmd>:lua require('smart-splits').move_cursor_down()<cr>", remap = true, desc = "Move cursor down" },
		{ "<A-k>", "<cmd>:lua require('smart-splits').move_cursor_up()<cr>", remap = true, desc = "Move cursor up" },
		{ "<A-l>", "<cmd>:lua require('smart-splits').move_cursor_right()<cr>", remap = true, desc = "Move cursor right" },

		{ "<A-H>", "<cmd>:lua require('smart-splits').resize_left()<cr>", remap = true, desc = "Resize window left" },
		{ "<A-J>", "<cmd>:lua require('smart-splits').resize_down()<cr>", remap = true, desc = "Resize window down" },
		{ "<A-K>", "<cmd>:lua require('smart-splits').resize_up()<cr>", remap = true, desc = "Resize window up" },
		{ "<A-L>", "<cmd>:lua require('smart-splits').resize_right()<cr>", remap = true, desc = "Resize window right" },

		{ "<A-C-h>", "<cmd>:lua require('smart-splits').swap_buf_left()<cr>", remap = true, desc = "Swap window left" },
		{ "<A-C-j>", "<cmd>:lua require('smart-splits').swap_buf_down()<cr>", remap = true, desc = "Swap window down" },
		{ "<A-C-k>", "<cmd>:lua require('smart-splits').swap_buf_up()<cr>", remap = true, desc = "Swap window up" },
		{ "<A-C-l>", "<cmd>:lua require('smart-splits').swap_buf_right()<cr>", remap = true, desc = "Swap window right" },
    }
}
