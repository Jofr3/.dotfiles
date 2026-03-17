return {
	"kndndrj/nvim-dbee",
	dependencies = {
		"MunifTanjim/nui.nvim",
	},
	build = function()
		require("dbee").install()
	end,
	config = function()
		require("dbee").setup({
			drawer = {
				disable_help = true,
        disable_candies = true,
			},
      call_log = {
        disable_candies = true,
      },
			sources = {
        require("dbee.sources").EnvSource:new("DBEE_CONNECTIONS"),
			},
		})
	end,
	keys = {
		{ mode = "n", "<A-r>", function() require("dbee").toggle() end, desc = "Toggle Dbee" },
	},
}
