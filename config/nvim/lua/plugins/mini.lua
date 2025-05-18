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
				left = "<D-h>",
				right = "<D-l>",
				down = "<D-j>",
				up = "<D-k>",

				line_left = "",
				line_right = "",
				line_down = "",
				line_up = "",
			},
		},
	},
}
