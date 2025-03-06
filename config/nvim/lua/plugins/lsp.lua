return {
  "neovim/nvim-lspconfig",
  enabled = true,
  lazy = false,
  config = function()
    vim.api.nvim_create_autocmd('LspAttach', {
      callback = function()
        vim.keymap.set('n', '<leader>d', vim.lsp.buf.declaration)
        vim.keymap.set('n', '<leader>f', vim.lsp.buf.definition)
        vim.keymap.set('n', '<leader>i', vim.lsp.buf.implementation)
        vim.keymap.set('n', '<leader>t', vim.lsp.buf.type_definition)
        vim.keymap.set('n', '<leader>r', vim.lsp.buf.references)

        vim.keymap.set('n', 'K', vim.lsp.buf.hover)
        vim.keymap.set('n', '<leader>k', vim.lsp.buf.signature_help)
        vim.keymap.set('n', '<leader>r', vim.lsp.buf.rename)

        vim.keymap.set('n', '<space>wa', vim.lsp.buf.add_workspace_folder)
        vim.keymap.set('n', '<space>wr', vim.lsp.buf.remove_workspace_folder)
        vim.keymap.set('n', '<space>wl',
          function() print(vim.inspect(vim.lsp.buf.list_workspace_folders())) end)

        vim.keymap.set("n", "<A-a>", "<cmd>lua vim.lsp.buf.format()<cr>")
        vim.keymap.set({ 'n', 'v' }, '<leadear>c', vim.lsp.buf.code_action)
      end,
    })

    local lspconfig = require('lspconfig')
    local capabilities = require('blink.cmp').get_lsp_capabilities()

    lspconfig.lua_ls.setup({ capabilities = capabilities })
    lspconfig.nil_ls.setup({ capabilities = capabilities })
    lspconfig.jsonls.setup({ capabilities = capabilities })
    lspconfig.tsserver.setup({ capabilities = capabilities })
  end,
}
