return {
	"stevearc/oil.nvim",
	enabled = true,
	opts = {
		default_file_explorer = true,
		delete_to_trash = true,
		view_options = {
			show_hidden = true,
		},
		win_options = {
			signcolumn = "yes",
		},
		use_default_keymaps = false,
		keymaps = {
			["<CR>"] = "actions.select",
			["<q>"] = "actions.close",
			["<Tab>"] = "actions.parent",
		},
	},
	keys = {
		{ "<C-n>", "<CMD>Oil<CR>", desc = "File exporer" },
	},
}
