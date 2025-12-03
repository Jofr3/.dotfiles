return {
	"nvim-telescope/telescope.nvim",
	enabled = true,
	lazy = true,
	tag = "0.1.8",
	dependencies = {
		"nvim-lua/plenary.nvim",
		"debugloop/telescope-undo.nvim",
		{
			"aaronhallaert/advanced-git-search.nvim",
			cmd = { "AdvancedGitSearch" },
		},
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
			layout_config = { width = 190, height = 45 },
		},
		extensions = {
			advanced_git_search = { diff_plugin = "diffview" },
		},
	},
	config = function(_, opts)
		local telescope = require("telescope")
		local pickers = require("telescope.pickers")
		local finders = require("telescope.finders")
		local conf = require("telescope.config").values
		local actions = require("telescope.actions")
		local action_state = require("telescope.actions.state")

		local custom_commands = {
			{ name = "Copy file path", cmd = "let @+ = expand('%:p')" },

			{ name = "Git diff", cmd = "DiffviewOpen" },
			{ name = "Git history", cmd = "DiffviewOpen" },
			{ name = "Git file diff", cmd = "DiffviewFileHistory" },
			{ name = "Git file history", cmd = "AdvancedGitSearch diff_commit_file" },
			{ name = "Git line history", cmd = "AdvancedGitSearch diff_commit_line" },
			{ name = "Git status", cmd = "Telescope git_status" },
			{ name = "Git blame", cmd = "G blame" },

			{ name = "Live grep", cmd = "Telescope live_grep" },
			{ name = "Search in file", cmd = "Telescope current_buffer_fuzzy_find" },
			{ name = "Undo tree", cmd = "Telescope undo" },

			{ name = "Format file", cmd = "lua require('conform').format()" },
			{ name = "Database", cmd = "tabnew | DBUI" },
		}

		local function run_command_picker(from_visual)
			pickers
				.new({}, {
					prompt_title = "Run Custom Command " .. (from_visual and "(Visual Selection)" or "(Normal)"),
					finder = finders.new_table({
						results = custom_commands,
						entry_maker = function(entry)
							return {
								value = entry,
								display = entry.name,
								ordinal = entry.name,
							}
						end,
					}),
					sorter = conf.generic_sorter({}),
					attach_mappings = function(prompt_bufnr, map)
						actions.select_default:replace(function()
							actions.close(prompt_bufnr)
							local selection = action_state.get_selected_entry()
							local cmd = selection.value.cmd

							vim.schedule(function()
								if from_visual then
									local last_mode = vim.fn.visualmode()
									if last_mode ~= "" then
										vim.cmd("normal! gv")
										vim.cmd("'<,'>" .. cmd)
									else
										print("No selection found, running normally.")
										vim.cmd(cmd)
									end
								else
									vim.cmd(cmd)
								end
							end)
						end)
						return true
					end,
				})
				:find()
		end

		vim.keymap.set("n", "<A-p>", function()
			run_command_picker(false)
		end, { desc = "Telescope Custom Commands" })

		vim.keymap.set("v", "<A-p>", function()
			run_command_picker(true)
		end, { desc = "Telescope Custom Commands (Visual)" })

		telescope.setup(opts)
		telescope.load_extension("advanced_git_search")
	end,
	keys = {
		{ mode = "n", "<A-o>", "<cmd>lua require('telescope.builtin').find_files()<cr>" },
		{ mode = "n", "<A-f>", "<cmd>lua require('telescope.builtin').buffers()<cr>" },
		{ mode = "n", "<A-c>", "<cmd>lua require('telescope.builtin').git_status()<cr>" },
		{ mode = "n", "<space><space>", "<cmd>lua require('telescope.builtin').resume()<cr>" },
	},
}
