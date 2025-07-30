return {
	"A7Lavinraj/fyler.nvim",
	enabled = true,
	lazy = true,
	branch = "stable",
	opts = {
    icon_provider = "none",
		auto_confirm_simple_edits = true,
		default_explorer = true,
		git_status = false,
		indentscope = {
			enabled = false,
		},
		views = {
			explorer = {
				width = 0.15,
				kind = "split:rightmost",
			},
		},
	},
	keys = {
		{ mode = "n", "<A-n>", "<cmd>Fyler<cr>" },
	},
}
