return {
    'ThePrimeagen/harpoon',
    enabled = true,
    keys = {
        { "<A-u>", "<cmd>:lua require('harpoon.ui').toggle_quick_menu()<cr>", desc = "Harpoon ui" },
        { "<A-s>", "<cmd>:lua require('harpoon.mark').add_file()<cr>",        desc = "Harpoon mark" },

        { "<A-1>", "<cmd>:lua require('harpoon.ui').nav_file(1)<cr>",       desc = "Harpoon goto" },
        { "<A-2>", "<cmd>:lua require('harpoon.ui').nav_file(2)<cr>",       desc = "Harpoon goto" },
        { "<A-3>", "<cmd>:lua require('harpoon.ui').nav_file(3)<cr>",       desc = "Harpoon goto" },
        { "<A-4>", "<cmd>:lua require('harpoon.ui').nav_file(4)<cr>",       desc = "Harpoon goto" },
        { "<A-5>", "<cmd>:lua require('harpoon.ui').nav_file(5)<cr>",       desc = "Harpoon goto" },
        { "<A-6>", "<cmd>:lua require('harpoon.ui').nav_file(6)<cr>",       desc = "Harpoon goto" },
        { "<A-7>", "<cmd>:lua require('harpoon.ui').nav_file(7)<cr>",       desc = "Harpoon goto" },
        { "<A-8>", "<cmd>:lua require('harpoon.ui').nav_file(8)<cr>",       desc = "Harpoon goto" },

        { "<A-i>", "<cmd>:lua require('harpoon.ui').nav_next()<cr>",        desc = "Harpoon nav next" },
        { "<A-o>", "<cmd>:lua require('harpoon.ui').nav_prev()<cr>",        desc = "Harpoon nav next" },
    }
}
