return {
    'JoosepAlviste/nvim-ts-context-commentstring',
    enabled = true,
    config = function()
        require('ts_context_commentstring').setup {
            enable_autocmd = false,
        }
    end
}
