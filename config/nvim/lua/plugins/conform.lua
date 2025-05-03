return {
	"stevearc/conform.nvim",
	enabled = true,
	lazy = false,
	opts = {
		formatters_by_ft = {
			lua = { "stylua", lsp_format = "fallback" },
			blade = { "blade-formatter" },
			php = { "blade-formatter" },
			nix = { "nixfmt" },
		},
	},
	keys = {
		{ mode = "n", "<D-;>", "<cmd>lua require('conform').format()<cr>" },
	},
}
