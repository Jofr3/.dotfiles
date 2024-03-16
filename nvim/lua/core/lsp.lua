local lspconfig = require('lspconfig')

-- Global mappings.
-- See `:help vim.diagnostic.*` for documentation on any of the below functions
vim.keymap.set('n', '<space>e', vim.diagnostic.open_float)
vim.keymap.set('n', '[d', vim.diagnostic.goto_prev)
vim.keymap.set('n', ']d', vim.diagnostic.goto_next)
vim.keymap.set('n', '<space>q', vim.diagnostic.setloclist)

vim.api.nvim_create_autocmd('LspAttach', {
    group = vim.api.nvim_create_augroup('UserLspConfig', {}),
    callback = function(ev)
        -- Buffer local mappings.
        -- See `:help vim.lsp.*` for documentation on any of the below functions
        local optsL = { buffer = ev.buf }
        vim.keymap.set('n', '<space>ld', vim.lsp.buf.declaration, optsL)
        vim.keymap.set('n', '<space>lf', vim.lsp.buf.definition, optsL)
        vim.keymap.set('n', '<space>lh', vim.lsp.buf.hover, optsL)
        vim.keymap.set('n', '<space>li', vim.lsp.buf.implementation, optsL)
        vim.keymap.set('n', '<space>ls', vim.lsp.buf.signature_help, optsL)
        -- vim.keymap.set('n', '<space>lwa', vim.lsp.buf.add_workspace_folder, optsL)
        -- vim.keymap.set('n', '<space>lwr', vim.lsp.buf.remove_workspace_folder, optsL)
        -- vim.keymap.set('n', '<space>lwl', function()
        --     print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
        -- end, optsL)
        vim.keymap.set('n', '<space>lt', vim.lsp.buf.type_definition, optsL)
        vim.keymap.set('n', '<space>lr', vim.lsp.buf.rename, optsL)
        vim.keymap.set('n', '<space>la', vim.lsp.buf.code_action, optsL)
        vim.keymap.set('n', '<space>le', vim.lsp.buf.references, optsL)
        -- vim.keymap.set('n', '<A-a>', function()
        --     vim.lsp.buf.format { async = true }
        -- end, optsL)
    end,
})

vim.g.lsp_servers = {
    'bashls',
    'html',
    'cssls',
    'tailwindcss',
    'tsserver',
    'jsonls',
    'volar',
    'prismals',
    'lua_ls',
    'dockerls',
    'intelephense',
    'docker_compose_language_service',
}

for _, lsp in ipairs(vim.g.lsp_servers) do
    lspconfig[lsp].setup {}
end
