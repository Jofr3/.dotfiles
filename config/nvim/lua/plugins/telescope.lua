return {
	"nvim-telescope/telescope.nvim",
	enabled = false,
	lazy = false,
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
		require("telescope").load_extension("fzf")
		require("telescope").setup({
			defaults = {
				-- preview = false,
        file_ignore_patterns = { "^storage/", "^public/", "^public_html/", "^node_modules/", "^assets/", "^database/migrations/", "^bootstrap/", "^vendor/", "^android/", "^ios/", "^neo4j/" },
				mappings = {
					n = {
						["<A-c>"] = require("telescope.actions").close,
						["<C-d>"] = require("telescope.actions").delete_buffer,
					},
				},
        layout_config = {
          width = 184,
          height = 45,
        },
			},
			pickers = {
				find_files = {
					preview = false,
				},
			},
			extensions = {
				fzf = {},
			},
		})
	end,
	keys = {
		-- { mode = "n", "<A-f>", "<cmd>lua require('telescope.builtin').find_files({ preview = false })<cr>" },
		-- { mode = { "n", "t" }, "<A-b>", "<cmd>lua require('telescope.builtin').buffers()<cr>" },
		-- { mode = "n", "<A-v>", "<cmd>lua require('telescope.builtin').live_grep()<cr>" },
		-- { mode = "n", "<A-/>", "<cmd>lua require('telescope.builtin').current_buffer_fuzzy_find()<cr>" },
		-- { mode = "n", "<space><space>", "<cmd>lua require('telescope.builtin').resume()<cr>" },
		-- { mode = "n", "<A-u>", "<cmd>Telescope undo<cr>" },
	},
}
