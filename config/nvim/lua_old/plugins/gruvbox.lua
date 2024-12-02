return { 
    "ellisonleao/gruvbox.nvim", 
	enabled = true,
    priority = 1000,
    config = false, 
    opts = {},
	init = function()
        vim.o.background = "dark"
        vim.cmd.colorscheme("gruvbox")

        vim.api.nvim_set_hl(0, "Normal", { bg = "#0B0B0B" })
        vim.api.nvim_set_hl(0, "Visual", { bg = "#2b2b2b" })
        vim.api.nvim_set_hl(0, "SignColumn", { bg = "#0B0B0B" })
        vim.api.nvim_set_hl(0, "EndOfBuffer", { fg = "#0B0B0B", bg = "none" })
        vim.api.nvim_set_hl(0, "VertSplit", { fg = "#101010", bg = "#101010" })
        vim.api.nvim_set_hl(0, "WinSeparator", { fg = "#101010", bg = "#101010" })
        vim.api.nvim_set_hl(0, "StatusLine", { fg = "#4F4F4F", bg = "#101010" })
        vim.api.nvim_set_hl(0, "StatusLineNC", { fg = "#4F4F4F", bg = "#101010", italic = true })
        vim.api.nvim_set_hl(0, "Pmenu", { bg = "#101010" })
        vim.api.nvim_set_hl(0, "PmenuSbar", { bg = "#101010" })
        vim.api.nvim_set_hl(0, "PmenuSel", { bg = "#202020" })
        vim.api.nvim_set_hl(0, "PmenuThumb", { bg = "#202020" })

        vim.api.nvim_set_hl(0, "CurSearch", { fg = "black", bg = "white" })
        vim.api.nvim_set_hl(0, "Search", { fg = "black", bg = "#7E7E7E" })
        vim.api.nvim_set_hl(0, "IncSearch", { fg = "black", bg = "#7E7E7E" })

        vim.api.nvim_set_hl(0, "Comment", { fg = "#3F3F3F" })
        vim.api.nvim_set_hl(0, "LineNr", { fg = "#4F4F4F" })
        vim.api.nvim_set_hl(0, "LineNrAbove", { fg = "#3F3F3F" })
        vim.api.nvim_set_hl(0, "LineNrBelow", { fg = "#3F3F3F" })

        vim.api.nvim_set_hl(0, "DiagnosticUnderlineError", { undercurl = true })
        vim.api.nvim_set_hl(0, "DiagnosticUnderlineWarn", { undercurl = true })
        vim.api.nvim_set_hl(0, "DiagnosticUnderlineInfo", { undercurl = true })
        vim.api.nvim_set_hl(0, "DiagnosticUnderlineHint", { undercurl = true })

        vim.api.nvim_set_hl(0, "Error", { fg = "#fb4934" })
        vim.api.nvim_set_hl(0, "ErrorMsg", { fg = "#fb4934" })
        vim.api.nvim_set_hl(0, "NvimInternalError", { fg = "#fb4934" })

        vim.api.nvim_set_hl(0, "TelescopeNormal", { fg = "#787878" })

        -- background 0B0B0B
        -- dark element 101010
        -- dark element 1 202020

        -- dark text 3F3F3F
        -- dark text 2 4F4F4F
	end,
}
