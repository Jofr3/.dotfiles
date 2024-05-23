return {
	"gruvbox-community/gruvbox",
	enabled = true,
	priority = 1000,
	init = function()
        vim.cmd.colorscheme("gruvbox")

        vim.api.nvim_set_hl(0, "Normal", { bg = "black" })

        vim.api.nvim_set_hl(0, "Visual", { bg = "#2b2b2b" })

        vim.api.nvim_set_hl(0, "CursorLine", { bg = "#161616" })

        vim.api.nvim_set_hl(0, "Search", { fg = "black", bg = "#83a598" })
        vim.api.nvim_set_hl(0, "CurSearch", { fg = "#b8bb26", bg = "black" })
        vim.api.nvim_set_hl(0, "IncSearch", { fg = "black", bg = "#b8bb26" })

        vim.api.nvim_set_hl(0, "SignColumn", { bg = "black" })

        vim.api.nvim_set_hl(0, "EndOfBuffer", { fg = "black", bg = "none" })

        vim.api.nvim_set_hl(0, "ColorColumn", { bg = "#161616" })

        vim.api.nvim_set_hl(0, "Comment", { fg = "#6b6b6b" })

        vim.api.nvim_set_hl(0, "Folded", { fg = "#8ec07c" })

        vim.api.nvim_set_hl(0, "VertSplit", { fg = "#161616", bg = "#161616" })
        vim.api.nvim_set_hl(0, "WinSeparator", { fg = "#161616", bg = "#161616" })

        vim.api.nvim_set_hl(0, "StatusLine", { fg = "#787878", bg = "#161616" })
        vim.api.nvim_set_hl(0, "StatusLineNC", { fg = "#787878", bg = "#161616", italic = true })

        vim.api.nvim_set_hl(0, "LineNrAbove", { fg = "#555555" })
        vim.api.nvim_set_hl(0, "LineNrBelow", { fg = "#555555" })
        vim.api.nvim_set_hl(0, "LineNr", { fg = "#959595" })

        vim.api.nvim_set_hl(0, "Pmenu", { bg = "#161616" })
        vim.api.nvim_set_hl(0, "PmenuSbar", { bg = "#2b2b2b" })
        vim.api.nvim_set_hl(0, "PmenuSel", { bg = "#2b2b2b" })
        vim.api.nvim_set_hl(0, "PmenuThumb", { bg = "#555555" })

        vim.api.nvim_set_hl(0, "GitSignsAdd", { fg = "#b8bb26", bg = "black" })
        vim.api.nvim_set_hl(0, "GitSignsChange", { fg = "#fe8019", bg = "black" })
        vim.api.nvim_set_hl(0, "GitSignsDelete", { fg = "#fb4934", bg = "black" })
        vim.api.nvim_set_hl(0, "GitSignsUntracked", { fg = "#928374", bg = "black" })

        vim.api.nvim_set_hl(0, "DiagnosticUnderlineError", { undercurl = true })
        vim.api.nvim_set_hl(0, "DiagnosticUnderlineWarn", { undercurl = true })
        vim.api.nvim_set_hl(0, "DiagnosticUnderlineInfo", { undercurl = true })
        vim.api.nvim_set_hl(0, "DiagnosticUnderlineHint", { undercurl = true })

        vim.api.nvim_set_hl(0, "DiagnosticUnderlineHint", { undercurl = true })

        vim.api.nvim_set_hl(0, "QuickFixLine", { bg = "#2b2b2b" })

        vim.api.nvim_set_hl(0, "Error", { fg = "#fb4934" })
        vim.api.nvim_set_hl(0, "ErrorMsg", { fg = "#fb4934" })
        vim.api.nvim_set_hl(0, "NvimInternalError", { fg = "#fb4934" })
	end,
}
