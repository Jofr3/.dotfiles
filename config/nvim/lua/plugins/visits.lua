return {
	"echasnovski/mini.visits",
  enabled = true,
  lazy = false,
  opts = {},
  keys = {
		{ mode = "n", "<A-s>", "<cmd>lua MiniExtra.pickers.visit_paths()<cr>" },

		{ mode = "n", "<A-!>", "<cmd>lua MiniVisits.add_label('1')<cr>" },
		{ mode = "n", "<A-@>", "<cmd>lua MiniVisits.add_label('2')<cr>" },
		{ mode = "n", "<A-#>", "<cmd>lua MiniVisits.add_label('3')<cr>" },
		{ mode = "n", "<A-$>", "<cmd>lua MiniVisits.add_label('4')<cr>" },
		{ mode = "n", "<A-%>", "<cmd>lua MiniVisits.add_label('5')<cr>" },

		{ mode = "n", "<A-C-1>", "<cmd>lua MiniVisits.remove_label('1')<cr>" },
		{ mode = "n", "<A-C-2>", "<cmd>lua MiniVisits.remove_label('2')<cr>" },
		{ mode = "n", "<A-C-3>", "<cmd>lua MiniVisits.remove_label('3')<cr>" },
		{ mode = "n", "<A-C-4>", "<cmd>lua MiniVisits.remove_label('4')<cr>" },
		{ mode = "n", "<A-C-5>", "<cmd>lua MiniVisits.remove_label('5')<cr>" },

		{ mode = "n", "<A-1>", "<cmd>lua MiniExtra.pickers.visit_paths({filter = '1'})<cr>" },
		{ mode = "n", "<A-2>", "<cmd>lua MiniExtra.pickers.visit_paths({filter = '2'})<cr>" },
		{ mode = "n", "<A-3>", "<cmd>lua MiniExtra.pickers.visit_paths({filter = '3'})<cr>" },
		{ mode = "n", "<A-4>", "<cmd>lua MiniExtra.pickers.visit_paths({filter = '4'})<cr>" },
		{ mode = "n", "<A-5>", "<cmd>lua MiniExtra.pickers.visit_paths({filter = '5'})<cr>" },
  }
}
