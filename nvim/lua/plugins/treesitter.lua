return {
    "nvim-treesitter/nvim-treesitter",
    enabled = true,
    config = function()
        require("nvim-treesitter.configs").setup({
            highlight = {
                enable = true,
                -- disable = { "html" }
            },
            incremental_selection = {
                enable = true
            },
            autotag = {
                enable = true
            },
            indent = {
                enable = true
            }
        })
    end
}
