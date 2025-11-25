return {
	"stevearc/conform.nvim",
	enabled = true,
	lazy = true,
	opts = {
		formatters_by_ft = {
			lua = { "stylua", lsp_format = "fallback" },
			-- blade = { "blade-formatter" },
			-- php = { "blade-formatter" },
			nix = { "nixfmt", lsp_format = "fallback" },
		},
	},
}
