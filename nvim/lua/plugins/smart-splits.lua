return {
    'mrjones2014/smart-splits.nvim',
    enabled = true,
    keys = {
        { "<A-h>", "<cmd>:lua require('smart-splits').move_cursor_left()<cr>", desc = "Move cursor left" },
        { "<A-j>", "<cmd>:lua require('smart-splits').move_cursor_down()<cr>", desc = "Move cursor down" },
        { "<A-k>", "<cmd>:lua require('smart-splits').move_cursor_up()<cr>", desc = "Move cursor up" },
        { "<A-l>", "<cmd>:lua require('smart-splits').move_cursor_right()<cr>", desc = "Move cursor right" },

        { "<A-H>", "<cmd>:lua require('smart-splits').resize_left()<cr>", desc = "Resize left" },
        { "<A-J>", "<cmd>:lua require('smart-splits').resize_down()<cr>", desc = "Resize down" },
        { "<A-K>", "<cmd>:lua require('smart-splits').resize_up()<cr>", desc = "Resize up" },
        { "<A-L>", "<cmd>:lua require('smart-splits').resize_right()<cr>", desc = "Resize right" },

        { "<A-C-h>", "<cmd>:lua require('smart-splits').swap_buf_left()<cr>", desc = "Swap buffer left" },
        { "<A-C-j>", "<cmd>:lua require('smart-splits').swap_buf_down()<cr>", desc = "Swap buffer down" },
        { "<A-C-k>", "<cmd>:lua require('smart-splits').swap_buf_up()<cr>", desc = "Swap buffer up" },
        { "<A-C-l>", "<cmd>:lua require('smart-splits').swap_buf_right()<cr>", desc = "Swap buffer right" },
    }
}
