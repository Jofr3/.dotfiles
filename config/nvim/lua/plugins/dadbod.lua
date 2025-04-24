return {
	"kristijanhusak/vim-dadbod-ui",
	enabled = false,
	lazy = false,
	dependencies = {
		{ "tpope/vim-dadbod", lazy = false },
		{ "kristijanhusak/vim-dadbod-completion", ft = { "sql", "mysql", "plsql" }, lazy = false },
	},
}
