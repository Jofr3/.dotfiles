return {
	"stevearc/oil.nvim",
	enabled = true,
	lazy = false,
	opts = {
		win_options = {
			signcolumn = "no",
			concealcursor = "nvic",
		},
		view_options = {
			show_hidden = true,
		},
		float = {
			padding = 0,
			max_width = 184,
			max_height = 45,
			border = { "┌", "─", "┐", "│", "┘", "─", "└", "│" },
		},
		keymaps = {
			["q"] = { "actions.close", mode = "n" },
		},
	},
	keys = {
		{ mode = "n", "<A-n>", "<cmd>lua require('oil').toggle_float()<cr>" },
	},
}
