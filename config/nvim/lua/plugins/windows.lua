return {
	"anuvyklack/windows.nvim",
	enabled = false,
	lazy = false,
	dependencies = { "anuvyklack/middleclass" },
	opts = {
		autowidth = {
			enable = false,
		},
	},
	keys = {
		{ mode = "n", "<A-m>", "<cmd>WindowsMaximize<cr>" },
	},
}
