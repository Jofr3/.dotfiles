return {
    "ThePrimeagen/vim-apm",
    enabled = true,
    config = function()
        local apm = require("vim-apm")

        apm:setup({})
    end,
    keys = {
        { "<Leader>a", "<cmd>:lua require('vim-apm'):toggle_monitor()<cr>", desc = "Toggle vim-apm monitor" },
    }
}
