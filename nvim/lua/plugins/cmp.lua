return {
    "hrsh7th/nvim-cmp",
    enabled = true,
    dependencies = {
        "hrsh7th/cmp-buffer",
        "hrsh7th/cmp-nvim-lsp",
        "hrsh7th/cmp-vsnip",
        "hrsh7th/cmp-path",
        "hrsh7th/cmp-cmdline",
        "hrsh7th/vim-vsnip",
    },
    config = function()
        vim.g.vsnip_snippet_dir = "~/.config/nvim/lua/snippets"
        local cmp = require("cmp")

        cmp.setup({
            snippet = {
                expand = function(args)
                    vim.fn["vsnip#anonymous"](args.body)
                end,
            },
            mapping = cmp.mapping.preset.insert({
                ["<Tab>"] = cmp.mapping.select_next_item({ behavior = cmp.SelectBehavior.Select }),
                ["<S-Tab>"] = cmp.mapping.select_prev_item({ behavior = cmp.SelectBehavior.Select }),
                ["<CR>"] = cmp.mapping.confirm({ select = true }),
            }),
            sources = cmp.config.sources({
                { name = "vsnip" },
                { name = "nvim_lsp" },
                { name = "buffer" },
            }),
        })

        cmp.setup.cmdline({ "/", "?" }, {
            mapping = cmp.mapping.preset.cmdline(),
            sources = {
                { name = "buffer" },
            },
        })

        cmp.setup.cmdline(":", {
            mapping = cmp.mapping.preset.cmdline(),
            sources = cmp.config.sources({
                { name = "path" },
                { name = "cmdline" },
            }),
        })

        local capabilities = require("cmp_nvim_lsp").default_capabilities()

        local lspconfig = require("lspconfig")

        lspconfig.lua_ls.setup({ capabilities = capabilities })

        lspconfig.volar.setup({ capabilities = capabilities })

        lspconfig.tsserver.setup({ capabilities = capabilities })

        lspconfig.html.setup({ capabilities = capabilities })

        lspconfig.cssls.setup({ capabilities = capabilities })

        lspconfig.marksman.setup({ capabilities = capabilities })

        lspconfig.jsonls.setup({ capabilities = capabilities })

        lspconfig.svelte.setup({ capabilities = capabilities })

        lspconfig.docker_compose_language_service.setup({ capabilities = capabilities })

        lspconfig.prismals.setup({ capabilities = capabilities })
    end,
}
