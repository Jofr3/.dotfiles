return {
	"anuvyklack/windows.nvim",
	enabled = true,
	lazy = false,
	dependencies = { "anuvyklack/middleclass" },
	opts = {
		autowidth = {
			enable = false,
		},
	},
	keys = {
		{ mode = "n", "<D-m>", "<cmd>WindowsMaximize<cr>" },
	},
}
