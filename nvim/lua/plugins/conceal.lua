return {
    "Jxstxs/conceal.nvim",
    enabled = true,
    config = function()
        vim.o.conceallevel = 2
        require("conceal").setup({
            ["lua"] = {
                enabled = false,
            },
            ["json"] = {
                enabled = false,
            },
            ["markdown"] = {
                enabled = true,
            },
        })
    end,
}
