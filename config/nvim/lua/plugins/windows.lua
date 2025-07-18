return {
	"anuvyklack/windows.nvim",
	enabled = false,
	-- lazy = false,
  event = "VeryLazy",
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
