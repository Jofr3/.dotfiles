return {
	"nvim-telescope/telescope.nvim",
	enabled = true,
	lazy = true,
	tag = "0.1.8",
	dependencies = {
		"nvim-lua/plenary.nvim",
		"debugloop/telescope-undo.nvim",
	},
	opts = {
		defaults = {
			file_ignore_patterns = {
				"^storage/",
				"^public/",
				"^public_html/",
				"^node_modules/",
				"^assets/",
				"^database/migrations/",
				"^bootstrap/",
				"^vendor/",
				"^android/",
				"^ios/",
				"^neo4j/",
				"^test/",
			},
			mappings = {
				n = {
					["q"] = require("telescope.actions").close,
					["<C-d>"] = require("telescope.actions").delete_buffer,
				},
				i = {
					["<A-c>"] = require("telescope.actions").close,
					["<A-v>"] = require("telescope.actions").select_vertical,
					["<A-x>"] = require("telescope.actions").select_horizontal,
					["<A-q>"] = require("telescope.actions").smart_send_to_qflist,
					["<A-o>"] = require("telescope.actions").cycle_history_prev,
					["<A-i>"] = require("telescope.actions").cycle_history_next,
				},
			},
			layout_config = {
				width = 190,
				height = 45,
			},
		},
	},
	config = function(_, opts)
		require("telescope").setup(opts)
		vim.api.nvim_set_hl(0, "TelescopePromptBorder", { fg = "#928374" })
		vim.api.nvim_set_hl(0, "TelescopePreviewBorder", { fg = "#928374" })
		vim.api.nvim_set_hl(0, "TelescopeResultsBorder", { fg = "#928374" })
	end,
	keys = {
		{ mode = "n", "<A-f>", "<cmd>lua require('telescope.builtin').find_files({ preview = false })<cr>" },
		{ mode = "n", "<A-g>", "<cmd>lua require('telescope.builtin').live_grep()<cr>" },
		{ mode = "n", "<A-/>", "<cmd>lua require('telescope.builtin').current_buffer_fuzzy_find()<cr>" },
		{ mode = "n", "<space><space>", "<cmd>lua require('telescope.builtin').resume()<cr>" },
		{ mode = "n", "<A-u>", "<cmd>Telescope undo<cr>" },
	},
}
