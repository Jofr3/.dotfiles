return {
    'ThePrimeagen/harpoon',
    enabled = true,
    keys = {
        { "<C-h>", "<cmd>:lua require('harpoon.ui').toggle_quick_menu()<cr>", desc = "Harpoon ui" },
        { "<C-m>", "<cmd>:lua require('harpoon.mark').add_file()<cr>",        desc = "Harpoon mark" },

        { "<C-1>", "<cmd>:lua require('harpoon.ui').nav_file(1)<cr>",       desc = "Harpoon goto" },
        { "<C-2>", "<cmd>:lua require('harpoon.ui').nav_file(2)<cr>",       desc = "Harpoon goto" },
        { "<C-3>", "<cmd>:lua require('harpoon.ui').nav_file(3)<cr>",       desc = "Harpoon goto" },
        { "<C-4>", "<cmd>:lua require('harpoon.ui').nav_file(4)<cr>",       desc = "Harpoon goto" },
        { "<C-5>", "<cmd>:lua require('harpoon.ui').nav_file(5)<cr>",       desc = "Harpoon goto" },
        { "<C-6>", "<cmd>:lua require('harpoon.ui').nav_file(6)<cr>",       desc = "Harpoon goto" },
        { "<C-7>", "<cmd>:lua require('harpoon.ui').nav_file(7)<cr>",       desc = "Harpoon goto" },
        { "<C-8>", "<cmd>:lua require('harpoon.ui').nav_file(8)<cr>",       desc = "Harpoon goto" },

        -- { "<Leader>i", "<cmd>:lua require('harpoon.ui').nav_next()<cr>",        desc = "Harpoon nav next" },
        -- { "<Leader>o", "<cmd>:lua require('harpoon.ui').nav_prev()<cr>",        desc = "Harpoon nav next" },
    }
}
