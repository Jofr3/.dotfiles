return {
    "kndndrj/nvim-dbee",
    enabled = false,
    dependencies = {
        "MunifTanjim/nui.nvim",
    },
    build = function()
        require("dbee").install("curl")
    end,
    config = function()
        require("dbee").setup {
            sources = {
                require("dbee.sources").EnvSource:new("DB_CONNECTIONS"),
            },
        }
    end
}
