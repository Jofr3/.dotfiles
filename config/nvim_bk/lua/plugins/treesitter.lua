return {
	"nvim-treesitter/nvim-treesitter",
	enabled = true,
	build = ":TSUpdate",
	opts = {
		ensure_installed = { "javascript", "vue", "typescript", "nix", "toml", "yaml", "bash", "sql", "pem", "xml", "diff", "fish", "http", "tmux", "regex", "angular", "html", "lua", "luadoc", "markdown", "vim", "vimdoc", "json" },
		auto_install = true,
		highlight = {
			enable = true,
			disable = { "oil" },
		},
		indent = {
			enable = true,
		},
	},
	config = function(_, opts)
		require("nvim-treesitter.install").prefer_git = true
		require("nvim-treesitter.configs").setup(opts)
		--    - Incremental selection: Included, see `:help nvim-treesitter-incremental-selection-mod`
	end,
}
