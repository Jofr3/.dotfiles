return {
	"stevearc/conform.nvim",
	enabled = true,
	lazy = false,
	opts = {
		notify_on_error = false,
		formatters_by_ft = {
			javascript = { "standardjs" },
			typescript = { "ts-standard" },
			markdown = { "prettier" },
			html = { "prettier" },
			nix = { "nixpkgs-fmt" },
			css = { "prettier" },
			jsx = { "prettier" },
			lua = { "stylua" },
		},
	},
	keys = {
		{
			"<leader>a",
			function()
				require("conform").format({ async = true, lsp_fallback = true })
			end,
			mode = "",
			desc = "Format buffer",
		},
	},
}
