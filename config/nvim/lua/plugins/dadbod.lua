return {
	"kristijanhusak/vim-dadbod-ui",
	enabled = true,
	lazy = true,
	dependencies = {
		{ "tpope/vim-dadbod", lazy = true },
		{ "kristijanhusak/vim-dadbod-completion", ft = { "sql", "mysql", "plsql" }, lazy = true },
	},
	cmd = {
		"DBUI",
		"DBUIToggle",
		"DBUIAddConnection",
		"DBUIFindBuffer",
	},
	init = function()
		vim.g.db_ui_use_nerd_fonts = 1
		vim.g.db_ui_disable_info_notifications = 1

		vim.g.dbs = {
			{
				name = "myclientum",
				url = "mysql://admin_crm_lsw:$Nok7n30@lasevawebdatabases.caczfioe6no3.eu-west-3.rds.amazonaws.com:3306/crm_lsw",
			},
			{
				name = "myclientum dev",
				url = "mysql://dev_myclientum:giX%250ZFrZ6dlLOrAe9D%212T2%40ps5tBzaY@lasevawebdatabases.caczfioe6no3.eu-west-3.rds.amazonaws.com:3306/dev_myclientum",
			},
			{
				name = "vicfires",
				url = "mysql://vic_fires_u:Uz6sCpr4BJBonEDfzwfNb9rqkXF2BF26@lasevawebdatabases.caczfioe6no3.eu-west-3.rds.amazonaws.com:3306/vic_fires",
			},
			{
				name = "admin",
				url = "mysql://adminlas_cronos_u:8fcP%26B*2F%24khh%262r@lasevawebdatabases.caczfioe6no3.eu-west-3.rds.amazonaws.com:3306/adminlas_cronos",
			},
		}
	end,
}
