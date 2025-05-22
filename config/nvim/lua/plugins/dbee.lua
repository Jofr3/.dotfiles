return {
	"kndndrj/nvim-dbee",
	dependencies = {
		"MunifTanjim/nui.nvim",
	},
	config = function()
		require("dbee").setup({
			sources = {
				require("dbee.sources").EnvSource:new("DBEE_CONNECTIONS"),
			},
		})
	end,
}
