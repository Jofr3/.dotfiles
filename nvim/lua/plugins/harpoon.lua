return {
    'ThePrimeagen/harpoon',
    enabled = true,
    keys = {
        { "<A-u>", "<cmd>:lua require(\"harpoon.ui\").toggle_quick_menu()<cr>", desc = "Harpoon ui" },
        { "<A-b>", "<cmd>:lua require(\"harpoon.mark\").add_file()<cr>",        desc = "Harpoon mark" },

        { "<A-s>", "<cmd>:lua require(\"harpoon.ui\").nav_file(1)<cr>",         desc = "Harpoon goto" },
        { "<A-d>", "<cmd>:lua require(\"harpoon.ui\").nav_file(2)<cr>",         desc = "Harpoon goto" },
        { "<A-f>", "<cmd>:lua require(\"harpoon.ui\").nav_file(3)<cr>",         desc = "Harpoon goto" },
        { "<A-g>", "<cmd>:lua require(\"harpoon.ui\").nav_file(4)<cr>",         desc = "Harpoon goto" },

        { "<A-i>", "<cmd>:lua require(\"harpoon.ui\").nav_next()<cr>",          desc = "Harpoon nav next" },
        { "<A-o>", "<cmd>:lua require(\"harpoon.ui\").nav_prev()<cr>",          desc = "Harpoon nav next" },
    }
}
