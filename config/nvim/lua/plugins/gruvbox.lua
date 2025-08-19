return {
	"ellisonleao/gruvbox.nvim",
	enabled = true,
	lazy = false,
	priority = 1001,
	config = function()
		vim.opt.background = "dark"
		vim.cmd("colorscheme gruvbox")

		vim.api.nvim_set_hl(0, "DiagnosticUnderlineError", { underdotted = true })
		vim.api.nvim_set_hl(0, "DiagnosticUnderlineWarn", { underdotted = true })
		vim.api.nvim_set_hl(0, "DiagnosticUnderlineInfo", { underdotted = true })
		vim.api.nvim_set_hl(0, "DiagnosticUnderlineHint", { underdotted = true })

		vim.api.nvim_set_hl(0, "EndOfBuffer", { fg = "#282828" })
		vim.api.nvim_set_hl(0, "SignColumn", { bg = "#282828" })

		vim.api.nvim_set_hl(0, "NormalFloat", { bg = "#282828" })
		vim.api.nvim_set_hl(0, "StatusLine", { bg = "none" })
	end,
}
