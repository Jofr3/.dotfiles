return {
	"echasnovski/mini.nvim",
	config = function()
		-- require("mini.ai").setup({ n_lines = 500 })
		-- require("mini.hipatterns").setup()
		require("mini.surround").setup()
		require("mini.cursorword").setup({
			delay = 200,
		})

		vim.api.nvim_set_hl(0, "MiniCursorword", { bg = "#281a1e" })
		vim.api.nvim_set_hl(0, "MiniCursorwordCurrent", { bg = "none" })
	end,
}
