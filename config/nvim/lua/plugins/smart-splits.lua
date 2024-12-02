return { 
    'mrjones2014/smart-splits.nvim',
    keys = {
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
