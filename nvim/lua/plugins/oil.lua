return {
    'stevearc/oil.nvim',
    enabled = true,
    config = function()
        require("oil").setup({
            default_file_explorer = true,
            delete_to_trash = true,
            view_options = {
                show_hidden = true,
            },
        })
    end,
    keys = {
        { "<C-n>", "<CMD>Oil<CR>", desc = "File exporer" },
    }
}
