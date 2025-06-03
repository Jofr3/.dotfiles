return {
	"echasnovski/mini.visits",
  enabled = true,
  lazy = false,
  opts = {},
  keys = {
		{ mode = "n", "<A-x>", "<cmd>lua MiniExtra.pickers.visit_paths()<cr>" },

		{ mode = "n", "<leader>1", "<cmd>lua MiniVisits.add_label('1')<cr>" },
		{ mode = "n", "<leader>2", "<cmd>lua MiniVisits.add_label('2')<cr>" },
		{ mode = "n", "<leader>3", "<cmd>lua MiniVisits.add_label('3')<cr>" },
		{ mode = "n", "<leader>4", "<cmd>lua MiniVisits.add_label('4')<cr>" },
		{ mode = "n", "<leader>5", "<cmd>lua MiniVisits.add_label('5')<cr>" },

		{ mode = "n", "<A-1>", "<cmd>lua MiniExtra.pickers.visit_paths({filter = '1'})<cr>" },
		{ mode = "n", "<A-2>", "<cmd>lua MiniExtra.pickers.visit_paths({filter = '2'})<cr>" },
		{ mode = "n", "<A-3>", "<cmd>lua MiniExtra.pickers.visit_paths({filter = '3'})<cr>" },
		{ mode = "n", "<A-4>", "<cmd>lua MiniExtra.pickers.visit_paths({filter = '4'})<cr>" },
		{ mode = "n", "<A-5>", "<cmd>lua MiniExtra.pickers.visit_paths({filter = '5'})<cr>" },
  }
}
