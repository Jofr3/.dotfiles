return {
	"stevearc/conform.nvim",
	enabled = true,
	lazy = true,
	opts = {
		formatters_by_ft = {
			-- lua = { "stylua", lsp_format = "fallback" },
			blade = { "blade-formatter" },
			php = { "blade-formatter" },
			nix = { "nixfmt" },
		},
	},
	keys = {
		{ mode = "n", "<A-;>", "<cmd>lua require('conform').format()<cr>" },
	},
}
