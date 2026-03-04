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
				require("dbee.sources").MemorySource:new({
					{
						name = "luminous-d1",
						type = "sqlite",
						url = "/home/jofre/projects/luminous/apps/backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/08eda4e27c155f8018a5558cd039e9d4c612ff984631de6ad63385d414c9cfc0.sqlite",
					},
				}),
			},
		})
	end,
	keys = {
		{ mode = "n", "<A-r>", function() require("dbee").toggle() end, desc = "Toggle Dbee" },
	},
}
