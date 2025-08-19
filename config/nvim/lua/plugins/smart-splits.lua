return {
	"mrjones2014/smart-splits.nvim",
	enabled = true,
	lazy = false,
	opts = {
		default_amount = 7,
	},
	keys = {
		{ mode = { "n", "t" }, "<A-h>", "<cmd>lua require('smart-splits').move_cursor_left()<cr>" },
		{ mode = { "n", "t" }, "<A-j>", "<cmd>lua require('smart-splits').move_cursor_down()<cr>" },
		{ mode = { "n", "t" }, "<A-k>", "<cmd>lua require('smart-splits').move_cursor_up()<cr>" },
		{ mode = { "n", "t" }, "<A-l>", "<cmd>lua require('smart-splits').move_cursor_right()<cr>" },

		{ mode = { "n", "t" }, "<A-H>", "<cmd>lua require('smart-splits').resize_left()<cr>" },
		{ mode = { "n", "t" }, "<A-J>", "<cmd>lua require('smart-splits').resize_down()<cr>" },
		{ mode = { "n", "t" }, "<A-K>", "<cmd>lua require('smart-splits').resize_up()<cr>" },
		{ mode = { "n", "t" }, "<A-L>", "<cmd>lua require('smart-splits').resize_right()<cr>" },

		{ mode = { "n", "t" }, "<A-C-h>", "<cmd>lua require('smart-splits').swap_buf_left()<cr>" },
		{ mode = { "n", "t" }, "<A-C-j>", "<cmd>lua require('smart-splits').swap_buf_down()<cr>" },
		{ mode = { "n", "t" }, "<A-C-k>", "<cmd>lua require('smart-splits').swap_buf_up()<cr>" },
		{ mode = { "n", "t" }, "<A-C-l>", "<cmd>lua require('smart-splits').swap_buf_right()<cr>" },
	},
}
