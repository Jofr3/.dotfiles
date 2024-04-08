return {
    'akinsho/toggleterm.nvim',
    enabled = true,
    version = "*",
    config = function()
        require("toggleterm").setup {
            open_mapping = [[<Leader>t]],
            autochdir = true,
            -- insert_mappings = false,
            highlights = {
                Normal = {
                    guibg = "#0d0d0d"
                }
            },
            shade_terminals = false,
            direction = 'float',
        }
    end
}
