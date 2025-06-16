return {
	"echasnovski/mini.visits",
	enabled = true,
	lazy = false,
	opts = {},
	init = function()
		local visits = require("mini.visits")
		visits.remove_file_picker = function(label)
			local paths = visits.list_paths(nil, { filter = label })

			vim.ui.select(paths, {
				prompt = "Select a file to remove:",
				format_item = function(item)
					return vim.fn.fnamemodify(item, ":~:.")
				end,
			}, function(choice)
				if choice then
					visits.remove_label(label, choice, nil)
				end
			end)
		end
	end,
	keys = {
		{ mode = "n", "<A-s>", "<cmd>lua MiniVisits.select_path()<cr>" },

	  { mode = "n", "<A-!>", "<cmd>lua MiniVisits.add_label('1')<cr>" },
		{ mode = "n", "<A-@>", "<cmd>lua MiniVisits.add_label('2')<cr>" },
		{ mode = "n", "<A-#>", "<cmd>lua MiniVisits.add_label('3')<cr>" },
		{ mode = "n", "<A-$>", "<cmd>lua MiniVisits.add_label('4')<cr>" },
		{ mode = "n", "<A-%>", "<cmd>lua MiniVisits.add_label('5')<cr>" },

		{ mode = "n", "<A-C-1>", "<cmd>lua MiniVisits.remove_file_picker('1')<cr>" },
		{ mode = "n", "<A-C-2>", "<cmd>lua MiniVisits.remove_file_picker('2')<cr>" },
		{ mode = "n", "<A-C-3>", "<cmd>lua MiniVisits.remove_file_picker('3')<cr>" },
		{ mode = "n", "<A-C-4>", "<cmd>lua MiniVisits.remove_file_picker('4')<cr>" },
		{ mode = "n", "<A-C-5>", "<cmd>lua MiniVisits.remove_file_picker('5')<cr>" },

		{ mode = "n", "<A-1>", "<cmd>lua MiniVisits.select_path(nil, {filter = '1'})<cr>" },
		{ mode = "n", "<A-2>", "<cmd>lua MiniVisits.select_path(nil, {filter = '2'})<cr>" },
		{ mode = "n", "<A-3>", "<cmd>lua MiniVisits.select_path(nil, {filter = '3'})<cr>" },
		{ mode = "n", "<A-4>", "<cmd>lua MiniVisits.select_path(nil, {filter = '4'})<cr>" },
		{ mode = "n", "<A-5>", "<cmd>lua MiniVisits.select_path(nil, {filter = '5'})<cr>" },
	},
}
