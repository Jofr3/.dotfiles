return {
	"kristijanhusak/vim-dadbod-ui",
	enabled = true,
	lazy = false,
	dependencies = {
		{ "tpope/vim-dadbod", lazy = false },
		{ "kristijanhusak/vim-dadbod-completion", ft = { "sql", "mysql", "plsql" }, lazy = false },
	},
}
