return {
    "hrsh7th/nvim-cmp",
    lazy = false,
    dependencies = {
        "hrsh7th/cmp-buffer",
        "hrsh7th/cmp-nvim-lsp",
        "hrsh7th/cmp-path",
        "hrsh7th/cmp-cmdline",
        "L3MON4D3/LuaSnip",
        "saadparwaiz1/cmp_luasnip",
    },
    config = function()
        local cmp = require("cmp")
        local luasnip = require("luasnip")

        luasnip.config.setup({})
        require("other.snippets")

        cmp.setup({
            snippet = {
                expand = function(args)
                    luasnip.lsp_expand(args.body)
                end,
            },
            completion = { completeopt = "menu,menuone,noinsert" },
            mapping = cmp.mapping.preset.insert({
                ["<C-j>"] = cmp.mapping.select_next_item(),
                ["<C-k>"] = cmp.mapping.select_prev_item(),
                ["<Tab>"] = cmp.mapping(function(fallback)
                    if cmp.visible() then
                        local entry = cmp.get_selected_entry()
                        if not entry then
                            cmp.select_next_item({ behavior = cmp.selectbehavior.select })
                        end
                        cmp.confirm()
                    else
                        fallback()
                    end
                end, { "i", "s", "c" }),
                -- ['<A-Tab>'] = cmp.mapping(function()
                --     if luasnip.expand() then
                --         luasnip.expand()
                --     end
                -- end, { 'i', 's' }),
                -- ['<C-l>'] = cmp.mapping(function()
                --     if luasnip.expand_or_locally_jumpable() then
                --         luasnip.expand_or_jump()
                --     end
                -- end, { 'i', 's' }),
                -- ['<C-h>'] = cmp.mapping(function()
                --     if luasnip.locally_jumpable(-1) then
                --         luasnip.jump(-1)
                --     end
                -- end, { 'i', 's' }),
            }),
            sources = {
                { name = "buffer" },
                { name = "nvim_lsp" },
                { name = "path" },
            }
        })

        cmp.setup.cmdline({ "/", "?" }, {
            mapping = cmp.mapping.preset.cmdline({
                ["<C-j>"] = cmp.mapping(cmp.mapping.select_next_item(), { "i", "c" }),
                ["<C-k>"] = cmp.mapping(cmp.mapping.select_prev_item(), { "i", "c" }),
                ["<Tab>"] = cmp.mapping(function(fallback)
                    if cmp.visible() then
                        local entry = cmp.get_selected_entry()
                        if not entry then
                            cmp.select_next_item({ behavior = cmp.selectbehavior.select })
                        end
                        cmp.confirm()
                    else
                        fallback()
                    end
                end, { "i", "s", "c" }),
            }),
            sources = {
                { name = "buffer" },
            },
        })

        cmp.setup.cmdline(":", {
            mapping = cmp.mapping.preset.cmdline({
                ["<C-j>"] = cmp.mapping(cmp.mapping.select_next_item(), { "i", "c" }),
                ["<C-k>"] = cmp.mapping(cmp.mapping.select_prev_item(), { "i", "c" }),
                ["<Tab>"] = cmp.mapping(function(fallback)
                    if cmp.visible() then
                        local entry = cmp.get_selected_entry()
                        if not entry then
                            cmp.select_next_item({ behavior = cmp.selectbehavior.select })
                        end
                        cmp.confirm()
                    else
                        fallback()
                    end
                end, { "i", "s", "c" }),
            }),
            sources = cmp.config.sources({
                { name = "path" },
                { name = "cmdline" },
            }),
        })
    end,
}
