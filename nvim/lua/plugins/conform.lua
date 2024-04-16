return {
    "stevearc/conform.nvim",
    opts = {},
    enabled = true,
    config = function()
        require("conform").setup({
            formatters_by_ft = {
                lua = { "stylua" },
                javascript = { { "prettier", "rustywind" } },
                markdown = { "prettier" },
                nix = { "nixpkgs-fmt" }
            },
        })
    end,
    keys = {
        { "<Leader>a", "<cmd>:lua require('conform').format({async=true, lsp_fallback=true})<cr>", desc = "Format buffer" },
    },
}
