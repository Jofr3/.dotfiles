return {
	"nvim-treesitter/nvim-treesitter",
	enabled = true,
	build = ":TSUpdate",
	opts = {
	  ensure_installed = { "lua", "vim", "vimdoc", "markdown", "markdown_inline" },
	  sync_install = true,
	  auto_install = true,
	  highlight = {
	    enable = true,
	    disable = { "c", "rust" },
	  },
	}
}
