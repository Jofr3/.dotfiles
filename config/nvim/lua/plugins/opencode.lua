return {
	"NickvanDyke/opencode.nvim",
	enabled = true,
	lazy = false,
	keys = {
		{ mode = { "i", "n" }, "<A-c>", "<cmd>lua require('opencode').toggle()<cr>" },
	},
}
