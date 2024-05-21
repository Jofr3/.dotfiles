return {
	"echasnovski/mini.nvim",
	enabled = false,
	config = function()
		-- require("mini.ai").setup({ n_lines = 500 })
		-- require("mini.hipatterns").setup()
		require("mini.surround").setup()
	end,
}
