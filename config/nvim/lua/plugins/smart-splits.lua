return {
	"mrjones2014/smart-splits.nvim",
	enabled = true,
	lazy = false,
	opts = {
		default_amount = 7,
	},
	keys = {
		{ mode = { "n", "t" }, "<D-h>", "<cmd>lua require('smart-splits').move_cursor_left()<cr>" },
		{ mode = { "n", "t" }, "<D-j>", "<cmd>lua require('smart-splits').move_cursor_down()<cr>" },
		{ mode = { "n", "t" }, "<D-k>", "<cmd>lua require('smart-splits').move_cursor_up()<cr>" },
		{ mode = { "n", "t" }, "<D-l>", "<cmd>lua require('smart-splits').move_cursor_right()<cr>" },

		{ mode = { "n", "t" }, "<D-H>", "<cmd>lua require('smart-splits').resize_left()<cr>" },
		{ mode = { "n", "t" }, "<D-J>", "<cmd>lua require('smart-splits').resize_down()<cr>" },
		{ mode = { "n", "t" }, "<D-K>", "<cmd>lua require('smart-splits').resize_up()<cr>" },
		{ mode = { "n", "t" }, "<D-L>", "<cmd>lua require('smart-splits').resize_right()<cr>" },

		{ mode = { "n", "t" }, "<D-C-h>", "<cmd>lua require('smart-splits').swap_buf_left()<cr>" },
		{ mode = { "n", "t" }, "<D-C-j>", "<cmd>lua require('smart-splits').swap_buf_down()<cr>" },
		{ mode = { "n", "t" }, "<D-C-k>", "<cmd>lua require('smart-splits').swap_buf_up()<cr>" },
		{ mode = { "n", "t" }, "<D-C-l>", "<cmd>lua require('smart-splits').swap_buf_right()<cr>" },
	},
}
