return {
	"nvim-treesitter/nvim-treesitter",
	enabled = true,
	config = function()
		require("nvim-treesitter.configs").setup({
			ensure_installed = { "lua", "vim", "vimdoc", "python", "html", "css", "javascript", "markdown", "markdown_inline", "json", "yaml", "bash", },
			highlight = { enable = true, disable = { "php" }},
			incremental_selection = { enable = true },
			autotag = { enable = true },
			indent = { enable = true },
		})
	end,
}
