return {
	"stevearc/conform.nvim",
	lazy = false,
	keys = {
		{
			"<leader>a",
			function()
				require("conform").format({ async = true, lsp_fallback = true })
			end,
			mode = "",
			desc = "[F]ormat buffer",
		},
	},
	opts = {
		notify_on_error = false,
		format_on_save = function(bufnr)
			local disable_filetypes = { php = true }
			return {
				timeout_ms = 500,
				lsp_fallback = not disable_filetypes[vim.bo[bufnr].filetype],
			}
		end,
		formatters_by_ft = {
			lua = { "stylua" },
			javascript = { "prettier", "rustywind" },
			markdown = { "prettier" },
			nix = { "nixpkgs-fmt" },
		},
		formatters = {
			stylua = {
				command = "/run/current-system/sw/bin/stylua",
			},
		},
	},
}
