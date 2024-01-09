return {
	"nvim-telescope/telescope.nvim",
	enabled = true,
	lazy = false,
	dependencies = { "nvim-lua/plenary.nvim" },
	config = function()
		require("telescope").setup({
			defaults = {
				file_ignore_patterns = { "node_modules", ".git" },
			},
			pickers = {
				find_files = {
					ingore = true,
					hidden = true,
				},
				live_grep = {
					hidden = true,
				},
			},
		})
	end,
	keys = {
		{ "<A-y>", "<cmd>Telescope find_files<cr>", desc = "Find files" },
		{ "<A-w>", "<cmd>Telescope lsp_workspace_symbols<cr>", desc = "Workspace symbols" },
		-- { "<A-h>", "<cmd>Telescope current_buffer_fuzzy_find<cr>",                   desc = "file grep" },
	},
}
