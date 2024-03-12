return {
    "nvim-telescope/telescope.nvim",
    enabled = true,
    lazy = false,
    dependencies = { "nvim-lua/plenary.nvim" },
    config = function()
        require("telescope").setup({
            defaults = {
                file_ignore_patterns = { "node_modules", ".git" }
            },
            pickers = {
                find_files = {
                    ingore = true,
                    hidden = true,
                },
                live_grep = {
                    hidden = true,
                },
            },
        })
    end,
    keys = {
        { "<C-f>",     "<cmd>Telescope find_files<cr>",            desc = "Find files" },
        { "<C-g>",     "<cmd>Telescope live_grep<cr>",           desc = "Grep string" },
        { "<Leader>s", "<cmd>Telescope lsp_workspace_symbols<cr>", desc = "Workspace symbols" },
    },
}
