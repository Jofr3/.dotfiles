return {
	"stevearc/oil.nvim",
	enabled = false,
	lazy = false,
	opts = {
		win_options = {
			signcolumn = "no",
			concealcursor = "nvic",
		},
		view_options = {
			show_hidden = true,
		},
		float = {
			padding = 0,
			max_width = 184,
			max_height = 45,
			border = { "┌", "─", "┐", "│", "┘", "─", "└", "│" },
		},
		keymaps = {
			["g?"] = { "actions.show_help", mode = "n" },
			["<CR>"] = "actions.select",
			["<C-s>"] = { "actions.select", opts = { vertical = true } },
			["<C-h>"] = { "actions.select", opts = { horizontal = true } },
			["<C-t>"] = { "actions.select", opts = { tab = true } },
			["<C-p>"] = "actions.preview",
			["<A-c>"] = { "actions.close", mode = "n" },
			["<C-l>"] = "actions.refresh",
			["<Del>"] = { "actions.parent", mode = "n" },
			["_"] = { "actions.open_cwd", mode = "n" },
			["`"] = { "actions.cd", mode = "n" },
			["~"] = { "actions.cd", opts = { scope = "tab" }, mode = "n" },
			["gs"] = { "actions.change_sort", mode = "n" },
			["gx"] = "actions.open_external",
			["g."] = { "actions.toggle_hidden", mode = "n" },
			["g\\"] = { "actions.toggle_trash", mode = "n" },
		},
	},
	keys = {
		{ mode = "n", "<A-n>", "<cmd>lua require('oil').toggle_float()<cr>" },
	},
}
