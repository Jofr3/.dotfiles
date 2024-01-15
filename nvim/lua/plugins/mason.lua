return {
    "williamboman/mason.nvim",
    enabled = true,
    config = function()
        require("mason").setup({
            ui = {
                icons = {
                    package_installed = "Ok",
                    package_pending = "->",
                    package_uninstalled = "X"
                }
            }
        })
    end
}
