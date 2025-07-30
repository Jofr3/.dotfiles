return {
	"nvim-telescope/telescope.nvim",
	enabled = true,
	lazy = true,
	tag = "0.1.8",
	dependencies = {
		"nvim-lua/plenary.nvim",
		"debugloop/telescope-undo.nvim",
		{
			"nvim-telescope/telescope-fzf-native.nvim",
			build = "make",
		},
	},
	config = function()
		vim.api.nvim_set_hl(0, "TelescopePromptBorder", { fg = "#928374" })
		vim.api.nvim_set_hl(0, "TelescopePreviewBorder", { fg = "#928374" })
		vim.api.nvim_set_hl(0, "TelescopeResultsBorder", { fg = "#928374" })

		require("telescope").load_extension("fzf")
		require("telescope").setup({
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
					},
				},
				layout_config = {
					width = 190,
					height = 45,
				},
			},
			-- pickers = {
			-- 	find_files = {
			-- 		preview = false,
			-- 	},
			-- },
			extensions = {
				fzf = {
					override_generic_sorter = true,
					override_file_sorter = true,
					case_mode = "smart_case",
				},
			},
		})
	end,
	keys = {
		{ mode = "n", "<A-f>", "<cmd>lua require('telescope.builtin').find_files({ preview = false })<cr>" },
		-- { mode = { "n", "t" }, "<A-b>", "<cmd>lua require('telescope.builtin').buffers()<cr>" },
		{ mode = "n", "<A-g>", "<cmd>lua require('telescope.builtin').live_grep()<cr>" },
		{ mode = "n", "<A-/>", "<cmd>lua require('telescope.builtin').current_buffer_fuzzy_find()<cr>" },
		{ mode = "n", "<space><space>", "<cmd>lua require('telescope.builtin').resume()<cr>" },
		-- { mode = "n", "<A-u>", "<cmd>Telescope undo<cr>" },
	},
}
