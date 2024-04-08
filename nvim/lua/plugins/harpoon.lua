return {
    'ThePrimeagen/harpoon',
    enabled = true,
    keys = {
        { "<Leader>h", "<cmd>:lua require('harpoon.ui').toggle_quick_menu()<cr>", remap = true, desc = "Harpoon ui" },
        { "<Leader>m", "<cmd>:lua require('harpoon.mark').add_file()<cr>",        remap = true, desc = "Harpoon mark" },

        { "<Leader>1", "<cmd>:lua require('harpoon.ui').nav_file(1)<cr>",         remap = true, desc = "Harpoon goto" },
        { "<Leader>2", "<cmd>:lua require('harpoon.ui').nav_file(2)<cr>",         remap = true, desc = "Harpoon goto" },
        { "<Leader>3", "<cmd>:lua require('harpoon.ui').nav_file(3)<cr>",         remap = true, desc = "Harpoon goto" },
        { "<Leader>4", "<cmd>:lua require('harpoon.ui').nav_file(4)<cr>",         remap = true, desc = "Harpoon goto" },
        { "<Leader>5", "<cmd>:lua require('harpoon.ui').nav_file(5)<cr>",         remap = true, desc = "Harpoon goto" },
        { "<Ledear>6", "<cmd>:lua require('harpoon.ui').nav_file(6)<cr>",         remap = true, desc = "Harpoon goto" }
    }
}
