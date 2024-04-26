return {
	"jiaoshijie/undotree",
	dependencies = "nvim-lua/plenary.nvim",
	config = function()
		require("undotree").setup({
			float_diff = false,
		})
	end,
	keys = {
		{ "<leader>h", "<cmd>lua require('undotree').toggle()<cr>" },
	},
}
