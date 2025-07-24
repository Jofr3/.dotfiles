return {
	"A7Lavinraj/fyler.nvim",
	dependencies = { "echasnovski/mini.icons" },
	enabled = true,
	lazy = false,
	branch = "stable",
	opts = {
		auto_confirm_simple_edits = true,
		default_explorer = true,
		git_status = false,
		indentscope = {
			enabled = false,
		},
		views = {
			explorer = {
				width = 0.15,
				kind = "split:leftmost",
			},
		},
	},
	keys = {
		{ mode = "n", "<A-n>", "<cmd>Fyler<cr>" },
	},
}
