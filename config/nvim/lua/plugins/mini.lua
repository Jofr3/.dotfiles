return {
	{
		"echasnovski/mini.diff",
		enabled = true,
		lazy = false,
		opts = {
			view = {
				style = "sign",
				signs = { add = "░", change = "░", delete = "░" },
			},
		},
	},
	{
		"echasnovski/mini.move",
		enabled = true,
		lazy = false,
		opts = {
			mappings = {
				left = "<A-h>",
				right = "<A-l>",
				down = "<A-j>",
				up = "<A-k>",

				line_left = "",
				line_right = "",
				line_down = "",
				line_up = "",
			},
		},
	},
}
