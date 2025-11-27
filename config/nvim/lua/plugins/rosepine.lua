return {
	"rose-pine/neovim",
	enabled = true,
	lazy = false,
	priority = 1000,
	name = "rose-pine",
	config = function()
		vim.cmd("colorscheme rose-pine-moon")
	end,
}

